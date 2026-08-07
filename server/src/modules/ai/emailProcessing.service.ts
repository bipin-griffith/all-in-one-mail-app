import { logger } from '../../config/logger';
import { Email } from '../../models/email.model';
import { extractReadableText } from '../email/textExtraction.service';

import { buildEmailAnalysisPrompt } from './emailAnalysis.prompt';
import { emailAnalysisResponseSchema, type EmailAnalysisResult } from './emailAnalysis.schema';
import { generateEmbedding } from './embedding.service';
import { completeJson } from './openai.client';

const FALLBACK_ANALYSIS: EmailAnalysisResult = {
  summary: 'Unable to generate a summary for this email.',
  category: 'personal',
  priority: 'medium',
  action: 'archive',
};

/**
 * Parses OpenAI's raw JSON string response. A genuinely malformed/truncated
 * JSON body is rare with `response_format: json_object` but re-throws so
 * the BullMQ job retries (a transient hiccup on OpenAI's side is likely to
 * succeed on retry); a *parseable but off-spec* response is repaired
 * field-by-field via the schema's `.catch()` fallbacks instead of failing
 * the job — see emailAnalysis.schema.ts.
 */
function parseAnalysisResponse(raw: string, emailId: string): EmailAnalysisResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('OpenAI returned invalid JSON for email analysis');
  }

  const result = emailAnalysisResponseSchema.safeParse(json);
  if (!result.success) {
    logger.warn(`[ai-processing] email ${emailId} analysis response was unusable, using fallback`);
    return FALLBACK_ANALYSIS;
  }

  return result.data;
}

/**
 * The AI processing pipeline for a single email (docs/AI_PIPELINE.md):
 * clean HTML → extract readable text → [summarize/categorize/prioritize/
 * detect action] + [generate embedding for RAG, docs/RAG_AND_DASHBOARDS.md]
 * — the two OpenAI calls run in parallel since they're independent (both
 * only depend on the already-extracted `cleanText`), not sequential. Called
 * exclusively from the BullMQ worker
 * (modules/queue/workers/emailProcessing.worker.ts), never inline during
 * sync — see docs/ARCHITECTURE.md's job lifecycle.
 */
export async function processEmail(emailId: string): Promise<void> {
  const email = await Email.findById(emailId);
  if (!email) {
    logger.warn(`[ai-processing] email ${emailId} no longer exists, skipping`);
    return;
  }

  email.aiStatus = 'processing';
  await email.save();

  try {
    const cleanText = extractReadableText(email.bodyHtml, email.bodyText);
    email.cleanText = cleanText;

    const prompt = buildEmailAnalysisPrompt({
      subject: email.subject,
      from: email.from,
      bodyText: cleanText || email.snippet,
    });

    // The embedding is generated from subject + body together (not body
    // alone) so semantic search can match on sender/subject-only signals
    // too — e.g. "Amazon invoices" should match on the sender/subject even
    // when the body text itself never says the word "invoice".
    const embeddingInput = `${email.subject}\n\n${cleanText || email.snippet}`;

    const [{ content, promptTokens, completionTokens }, embeddingResult] = await Promise.all([
      completeJson(prompt.system, prompt.user),
      generateEmbedding(embeddingInput),
    ]);

    const analysis = parseAnalysisResponse(content, emailId);

    email.aiSummary = analysis.summary;
    email.aiCategory = analysis.category;
    email.aiPriority = analysis.priority;
    email.aiAction = analysis.action;
    email.aiTokens = { prompt: promptTokens, completion: completionTokens };
    email.aiStatus = 'completed';
    email.aiProcessedAt = new Date();
    email.aiError = null;

    email.embedding = embeddingResult.embedding;
    email.embeddingModel = embeddingResult.model;
    email.embeddingGeneratedAt = new Date();

    await email.save();

    logger.info(
      `[ai-processing] email ${emailId} completed: category=${analysis.category} priority=${analysis.priority} action=${analysis.action} tokens=${promptTokens}+${completionTokens}+${embeddingResult.tokens}(embedding)`,
    );
  } catch (err) {
    const message = (err as Error).message;
    email.aiStatus = 'failed';
    email.aiError = message;
    await email.save();
    logger.error(`[ai-processing] email ${emailId} failed: ${message}`);
    throw err; // rethrow so BullMQ retries per the queue's backoff policy
  }
}

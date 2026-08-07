import { EmailAccount } from '../../models/emailAccount.model';
import { ApiError } from '../../utils/ApiError';

import { assertQuotaAndIncrement } from './aiUsage.service';
import { generateEmbedding } from './embedding.service';
import { completeChat } from './openai.client';
import { searchSimilarEmails, type EmailSearchResult } from './vectorSearch.service';

/**
 * How many candidate emails are retrieved and handed to the LLM as context.
 * Higher recall costs more tokens; 8 is a reasonable default for
 * conversational questions ("who rejected me?", "show Amazon invoices") but
 * is a real limitation for aggregate/counting questions ("how many
 * companies replied this month?") if more than 8 matches exist — see
 * docs/RAG_AND_DASHBOARDS.md for why this is a known, accepted tradeoff of
 * pure semantic-retrieval RAG rather than something this endpoint hides.
 */
const RETRIEVAL_LIMIT = 8;

export interface ChatSource {
  emailId: string;
  subject: string;
  from: string;
  receivedAt: Date;
  score: number;
}

export interface ChatResult {
  answer: string;
  sources: ChatSource[];
  tokensUsed: number;
}

/**
 * Builds the context block from *already-computed* `aiSummary` fields
 * (falling back to Gmail's own `snippet` for emails not yet processed)
 * rather than re-sending each email's full body. This is the single
 * biggest token saving available for RAG here, and it's a direct payoff of
 * the automatic AI pipeline (docs/AI_PIPELINE.md) having already summarized
 * every email at sync time — retrieval-time context reuses that work
 * instead of redoing it per chat message.
 */
function buildContextBlock(results: EmailSearchResult[]): string {
  return results
    .map((r, i) => {
      const summary = r.aiSummary ?? r.snippet ?? '(no summary available)';
      const date = r.receivedAt.toISOString().slice(0, 10);
      return `[${i + 1}] From: ${r.from} | Subject: ${r.subject} | Date: ${date} | Category: ${r.aiCategory ?? 'unknown'}\n${summary}`;
    })
    .join('\n\n');
}

/**
 * Grounding instructions are the core defense against hallucination in a
 * RAG system: the model is explicitly told to answer only from the
 * provided excerpts, to cite which numbered email it's drawing from, and to
 * say plainly when the context doesn't have the answer rather than
 * guessing.
 */
const SYSTEM_PROMPT = [
  "You are an email assistant answering questions about the user's inbox.",
  'Answer using ONLY the numbered email excerpts provided below — never invent information not present in them.',
  'When you reference an email, cite it by its number in brackets, e.g. [2].',
  "If the provided context doesn't contain enough information to answer confidently, say so plainly instead of guessing.",
  'Be concise.',
].join(' ');

/**
 * The RAG pipeline: embed the question → vector-search the user's own
 * emails for relevant context → send that context + the question to
 * OpenAI → return a grounded answer with its sources.
 *
 * Runs synchronously within the request (unlike summarize/draft/classify,
 * which are always queued — see docs/ARCHITECTURE.md). This is a
 * deliberate exception: a chat reply is an interactive "wait for the
 * answer" interaction the client is actively waiting on, not a bulk
 * background operation, and the total work here (one embedding call + one
 * chat completion) is small and bounded — there's no batch of dozens of
 * emails to process the way a mailbox sync has.
 */
export async function askQuestion(userId: string, message: string): Promise<ChatResult> {
  // Same per-plan quota as manual summarize/draft/classify — this is a
  // user-initiated action, unlike the automatic per-email pipeline. See
  // aiUsage.service.ts.
  await assertQuotaAndIncrement(userId);

  const accounts = await EmailAccount.find({ user: userId }).select('_id');
  if (accounts.length === 0) {
    throw ApiError.badRequest('Connect a mailbox before asking questions about your email');
  }
  const accountIds = accounts.map((a) => a.id as string);

  const { embedding: queryEmbedding } = await generateEmbedding(message);
  const results = await searchSimilarEmails(accountIds, queryEmbedding, RETRIEVAL_LIMIT);

  if (results.length === 0) {
    return {
      answer:
        "I couldn't find any emails related to that. Try syncing your mailbox first, or rephrasing the question.",
      sources: [],
      tokensUsed: 0,
    };
  }

  const userPrompt = `Question: ${message}\n\nRelevant emails:\n${buildContextBlock(results)}`;
  const { content, promptTokens, completionTokens } = await completeChat(SYSTEM_PROMPT, userPrompt);

  return {
    answer: content,
    sources: results.map((r) => ({
      emailId: r.id,
      subject: r.subject,
      from: r.from,
      receivedAt: r.receivedAt,
      score: r.score,
    })),
    tokensUsed: promptTokens + completionTokens,
  };
}

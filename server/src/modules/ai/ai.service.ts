import { AiInteraction, type AiInteractionDocument, type AiInteractionType } from '../../models/aiInteraction.model';
import { Email } from '../../models/email.model';
import { Thread, type ThreadDocument } from '../../models/thread.model';
import { ApiError } from '../../utils/ApiError';
import { enqueueAiJob } from '../queue/queues/ai.queue';

import { assertQuotaAndIncrement } from './aiUsage.service';
import { completeChat } from './gemini.client';

async function assertThreadOwnership(userId: string, threadId: string): Promise<ThreadDocument> {
  const thread = await Thread.findById(threadId).populate('emailAccount');
  const account = thread?.emailAccount as unknown as { user: string } | undefined;
  if (!thread || !account || String(account.user) !== userId) {
    throw ApiError.notFound('Thread not found');
  }
  return thread;
}

async function enqueue(
  userId: string,
  threadId: string,
  type: AiInteractionType,
): Promise<{ jobId: string; aiInteractionId: string }> {
  await assertThreadOwnership(userId, threadId);
  await assertQuotaAndIncrement(userId);

  const interaction = await AiInteraction.create({
    user: userId,
    thread: threadId,
    type,
    status: 'queued',
    jobId: 'pending',
  });

  const jobId = await enqueueAiJob({
    aiInteractionId: interaction.id as string,
    userId,
    threadId,
    type,
  });

  interaction.jobId = jobId;
  await interaction.save();

  return { jobId, aiInteractionId: interaction.id as string };
}

export const enqueueSummarize = (
  userId: string,
  threadId: string,
): Promise<{ jobId: string; aiInteractionId: string }> => enqueue(userId, threadId, 'summarize');

export const enqueueDraftReply = (
  userId: string,
  threadId: string,
): Promise<{ jobId: string; aiInteractionId: string }> => enqueue(userId, threadId, 'draft_reply');

export const enqueueClassify = (
  userId: string,
  threadId: string,
): Promise<{ jobId: string; aiInteractionId: string }> => enqueue(userId, threadId, 'classify');

export async function getJobStatus(userId: string, jobId: string): Promise<AiInteractionDocument> {
  const interaction = await AiInteraction.findOne({ jobId, user: userId });
  if (!interaction) throw ApiError.notFound('Job not found');
  return interaction;
}

/** Builds a bounded transcript of a thread's messages for prompting — newest first, capped for token budget. */
async function buildThreadTranscript(threadId: string): Promise<string> {
  const emails = await Email.find({ thread: threadId }).sort({ receivedAt: -1 }).limit(20);
  return emails
    .reverse()
    .map((e) => `From: ${e.from}\nSubject: ${e.subject}\n\n${e.bodyText.slice(0, 2000)}`)
    .join('\n---\n');
}

export async function runSummarize(threadId: string): Promise<{ summary: string; tokens: [number, number] }> {
  const transcript = await buildThreadTranscript(threadId);
  const { content, promptTokens, completionTokens } = await completeChat(
    'You summarize email threads concisely for a busy professional. 3-5 sentences, plain text, no preamble.',
    transcript,
  );
  return { summary: content, tokens: [promptTokens, completionTokens] };
}

export async function runDraftReply(
  threadId: string,
  instructions?: string,
): Promise<{ draft: string; tokens: [number, number] }> {
  const transcript = await buildThreadTranscript(threadId);
  const { content, promptTokens, completionTokens } = await completeChat(
    'You draft professional, concise email replies. Match the tone of the thread. Output only the reply body.',
    `${transcript}\n---\nAdditional instructions: ${instructions ?? 'none'}`,
  );
  return { draft: content, tokens: [promptTokens, completionTokens] };
}

const VALID_CATEGORIES = ['urgent', 'newsletter', 'receipt', 'personal', 'work', 'spam', 'other'];

export async function runClassify(
  threadId: string,
): Promise<{ category: string; tokens: [number, number] }> {
  const transcript = await buildThreadTranscript(threadId);
  const { content, promptTokens, completionTokens } = await completeChat(
    `Classify the email thread into exactly one of: ${VALID_CATEGORIES.join(', ')}. Respond with only the category word.`,
    transcript,
  );

  const category = content.trim().toLowerCase();
  const resolved = VALID_CATEGORIES.includes(category) ? category : 'other';

  await Thread.findByIdAndUpdate(threadId, { aiCategory: resolved });

  return { category: resolved, tokens: [promptTokens, completionTokens] };
}

import { Worker, type Job } from 'bullmq';

import { env } from '../../../config/env';
import { logger } from '../../../config/logger';
import { redisConnectionOptions } from '../../../config/redis';
import { AiInteraction } from '../../../models/aiInteraction.model';
import { runClassify, runDraftReply, runSummarize } from '../../ai/ai.service';
import { QueueNames } from '../queue.names';
import type { AiJobData } from '../queues/ai.queue';

async function process(job: Job<AiJobData>): Promise<unknown> {
  const { aiInteractionId, threadId, type } = job.data;

  await AiInteraction.findByIdAndUpdate(aiInteractionId, { status: 'processing' });

  const outcome =
    type === 'summarize'
      ? await runSummarize(threadId)
      : type === 'draft_reply'
        ? await runDraftReply(threadId)
        : await runClassify(threadId);

  const [promptTokens, completionTokens] = outcome.tokens;

  await AiInteraction.findByIdAndUpdate(aiInteractionId, {
    status: 'completed',
    result: outcome,
    promptTokens,
    completionTokens,
  });

  return outcome;
}

export function createAiWorker(): Worker<AiJobData> {
  const worker = new Worker<AiJobData>(QueueNames.AI_PROCESSING, process, {
    connection: redisConnectionOptions,
    concurrency: env.WORKER_CONCURRENCY,
  });

  worker.on('completed', (job) => logger.info(`[ai] completed job ${job.id} (${job.data.type})`));
  worker.on('failed', (job, err) => {
    logger.error(`[ai] job ${job?.id} failed: ${err.message}`);
    if (job) {
      void AiInteraction.findByIdAndUpdate(job.data.aiInteractionId, {
        status: 'failed',
        error: err.message,
      });
    }
  });

  return worker;
}

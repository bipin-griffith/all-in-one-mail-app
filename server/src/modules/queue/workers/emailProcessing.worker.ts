import { Worker, type Job } from 'bullmq';

import { env } from '../../../config/env';
import { logger } from '../../../config/logger';
import { redisConnectionOptions } from '../../../config/redis';
import { processEmail } from '../../ai/emailProcessing.service';
import { QueueNames } from '../queue.names';
import type { EmailProcessingJobData } from '../queues/emailProcessing.queue';

/**
 * Gemini's free tier caps `generate_content` at 15 requests/minute per
 * project+model — a hard ceiling, not a soft one (a burst past it returns
 * 429 immediately, and the default 3-attempt/max-20s backoff isn't remotely
 * long enough to outlast Google's ~45-60s cooldown, so a burst just burns
 * every retry and fails outright). This queue processes every newly synced
 * email automatically, so connecting a mailbox with a large backlog (or a
 * multi-day gap since the last sync) enqueues dozens of jobs at once —
 * without a limiter, `WORKER_CONCURRENCY` lets them all fire concurrently
 * and blow through the quota in well under a second.
 *
 * Its sibling `ai.worker.ts` (user-triggered summarize/draft/classify)
 * draws against the same shared per-project quota, so this budget is
 * deliberately set below the full 15 rather than claiming all of it,
 * leaving headroom for user-initiated actions to still go through promptly
 * while a backlog drains in the background.
 */
const GEMINI_RATE_LIMIT = { max: 10, duration: 60_000 };

export function createEmailProcessingWorker(): Worker<EmailProcessingJobData> {
  const worker = new Worker<EmailProcessingJobData>(
    QueueNames.EMAIL_AI_PROCESSING,
    async (job: Job<EmailProcessingJobData>) => {
      await processEmail(job.data.emailId);
    },
    { connection: redisConnectionOptions, concurrency: env.WORKER_CONCURRENCY, limiter: GEMINI_RATE_LIMIT },
  );

  worker.on('active', (job) => logger.info(`[email-ai] started job ${job.id} (email ${job.data.emailId})`));
  worker.on('completed', (job) => logger.info(`[email-ai] completed job ${job.id}`));
  worker.on('failed', (job, err) => {
    logger.error(
      `[email-ai] job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts.attempts}): ${err.message}`,
    );
  });

  return worker;
}

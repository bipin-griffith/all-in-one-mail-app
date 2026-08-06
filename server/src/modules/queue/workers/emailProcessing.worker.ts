import { Worker, type Job } from 'bullmq';

import { env } from '../../../config/env';
import { logger } from '../../../config/logger';
import { redisConnectionOptions } from '../../../config/redis';
import { processEmail } from '../../ai/emailProcessing.service';
import { QueueNames } from '../queue.names';
import type { EmailProcessingJobData } from '../queues/emailProcessing.queue';

export function createEmailProcessingWorker(): Worker<EmailProcessingJobData> {
  const worker = new Worker<EmailProcessingJobData>(
    QueueNames.EMAIL_AI_PROCESSING,
    async (job: Job<EmailProcessingJobData>) => {
      await processEmail(job.data.emailId);
    },
    { connection: redisConnectionOptions, concurrency: env.WORKER_CONCURRENCY },
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

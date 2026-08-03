import { Worker, type Job } from 'bullmq';

import { env } from '../../../config/env';
import { logger } from '../../../config/logger';
import { redisConnectionOptions } from '../../../config/redis';
import { performGmailSync } from '../../email/email.service';
import { QueueNames } from '../queue.names';
import type { EmailSyncJobData } from '../queues/emailSync.queue';

export function createEmailSyncWorker(): Worker<EmailSyncJobData> {
  const worker = new Worker<EmailSyncJobData>(
    QueueNames.EMAIL_SYNC,
    async (job: Job<EmailSyncJobData>) => {
      await performGmailSync(job.data.emailAccountId);
    },
    { connection: redisConnectionOptions, concurrency: env.WORKER_CONCURRENCY },
  );

  worker.on('completed', (job) => logger.info(`[email-sync] completed job ${job.id}`));
  worker.on('failed', (job, err) =>
    logger.error(`[email-sync] job ${job?.id} failed: ${err.message}`),
  );

  return worker;
}

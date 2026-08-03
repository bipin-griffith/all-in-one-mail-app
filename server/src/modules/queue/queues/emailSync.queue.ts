import { Queue } from 'bullmq';

import { redisConnectionOptions } from '../../../config/redis';
import { QueueNames } from '../queue.names';

export interface EmailSyncJobData {
  emailAccountId: string;
}

export const emailSyncQueue = new Queue<EmailSyncJobData>(QueueNames.EMAIL_SYNC, {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 24 * 3600 },
  },
});

export async function enqueueEmailSync(emailAccountId: string): Promise<string> {
  const job = await emailSyncQueue.add(
    'sync',
    { emailAccountId },
    // De-dupe: only one pending sync per account at a time.
    { jobId: `sync:${emailAccountId}` },
  );
  return job.id ?? job.name;
}

import { Queue } from 'bullmq';

import { redisConnectionOptions } from '../../../config/redis';
import { QueueNames } from '../queue.names';

export interface EmailProcessingJobData {
  emailId: string;
}

export const emailProcessingQueue = new Queue<EmailProcessingJobData>(QueueNames.EMAIL_AI_PROCESSING, {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    // Retry mechanism: OpenAI/network calls are occasionally flaky but
    // usually succeed on a subsequent attempt — exponential backoff spaces
    // retries out instead of hammering OpenAI immediately after a failure.
    // Same policy as emailSyncQueue, for the same reason (both call a
    // third-party API that can have transient outages).
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 24 * 3600 },
  },
});

export async function enqueueEmailProcessing(emailId: string): Promise<string> {
  const job = await emailProcessingQueue.add(
    'process',
    { emailId },
    // De-dupe: never queue the same email twice concurrently.
    { jobId: `email-ai-${emailId}` },
  );
  return job.id ?? job.name;
}

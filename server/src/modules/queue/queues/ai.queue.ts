import { Queue } from 'bullmq';

import { redisConnectionOptions } from '../../../config/redis';
import type { AiInteractionType } from '../../../models/aiInteraction.model';
import { QueueNames } from '../queue.names';

export interface AiJobData {
  aiInteractionId: string;
  userId: string;
  threadId: string;
  type: AiInteractionType;
}

export const aiQueue = new Queue<AiJobData>(QueueNames.AI_PROCESSING, {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 24 * 3600 },
  },
});

export async function enqueueAiJob(data: AiJobData): Promise<string> {
  const job = await aiQueue.add(data.type, data);
  return job.id ?? data.aiInteractionId;
}

export const QueueNames = {
  EMAIL_SYNC: 'email-sync',
  AI_PROCESSING: 'ai-processing',
} as const;

export type QueueName = (typeof QueueNames)[keyof typeof QueueNames];

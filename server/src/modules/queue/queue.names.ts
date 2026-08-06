export const QueueNames = {
  EMAIL_SYNC: 'email-sync',
  /** User-triggered, thread-level ops (summarize/draft-reply/classify) — see modules/ai. */
  AI_PROCESSING: 'ai-processing',
  /** Automatic, per-email pipeline that runs on every newly synced email — see modules/ai/emailProcessing.service.ts. */
  EMAIL_AI_PROCESSING: 'email-ai-processing',
} as const;

export type QueueName = (typeof QueueNames)[keyof typeof QueueNames];

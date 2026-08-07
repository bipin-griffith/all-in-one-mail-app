import { z } from 'zod';

export const chatRequestSchema = z
  .object({
    message: z.string().trim().min(1).max(1000),
  })
  .strict();

export type ChatRequestInput = z.infer<typeof chatRequestSchema>;

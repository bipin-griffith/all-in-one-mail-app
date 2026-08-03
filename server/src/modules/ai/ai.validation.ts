import { z } from 'zod';

const threadIdField = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid thread id');

export const summarizeSchema = z.object({ threadId: threadIdField }).strict();
export type SummarizeInput = z.infer<typeof summarizeSchema>;

export const draftReplySchema = z
  .object({
    threadId: threadIdField,
    instructions: z.string().trim().max(500).optional(),
  })
  .strict();
export type DraftReplyInput = z.infer<typeof draftReplySchema>;

export const classifySchema = z.object({ threadId: threadIdField }).strict();
export type ClassifyInput = z.infer<typeof classifySchema>;

export const jobIdParamSchema = z.object({ jobId: z.string().min(1) }).strict();

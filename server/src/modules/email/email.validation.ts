import { z } from 'zod';

import { EMAIL_AI_ACTIONS, EMAIL_AI_CATEGORIES, EMAIL_AI_PRIORITIES } from '../../models/email.model';

export const listThreadsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    category: z.string().trim().optional(),
    q: z.string().trim().optional(),
  })
  .strict();

export type ListThreadsQuery = z.infer<typeof listThreadsQuerySchema>;

export const threadIdParamSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid thread id'),
  })
  .strict();

export const updateThreadSchema = z
  .object({
    isRead: z.boolean().optional(),
    labels: z.array(z.string()).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' });

export type UpdateThreadInput = z.infer<typeof updateThreadSchema>;

export const emailAccountIdParamSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid email account id'),
  })
  .strict();

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

export const listEmailsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    category: z.enum(['inbox', 'sent', 'drafts', 'promotions', 'social', 'other']).optional(),
    // AI-derived filters (docs/AI_PIPELINE.md) — distinct from `category` above,
    // which is Gmail-label-derived, not content-based.
    aiCategory: z.enum(EMAIL_AI_CATEGORIES).optional(),
    aiPriority: z.enum(EMAIL_AI_PRIORITIES).optional(),
    aiAction: z.enum(EMAIL_AI_ACTIONS).optional(),
    threadId: objectId.optional(),
    q: z.string().trim().optional(),
  })
  .strict();

export type ListEmailsQuery = z.infer<typeof listEmailsQuerySchema>;

export const emailIdParamSchema = z.object({ id: objectId }).strict();

export const attachmentParamSchema = z
  .object({
    id: objectId,
    attachmentId: z.string().min(1),
  })
  .strict();

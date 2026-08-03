import { z } from 'zod';

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

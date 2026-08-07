import { z } from 'zod';

import { EMAIL_AI_CATEGORIES } from '../../models/email.model';

export const categoryParamSchema = z
  .object({
    aiCategory: z.enum(EMAIL_AI_CATEGORIES),
  })
  .strict();

export type CategoryParam = z.infer<typeof categoryParamSchema>;

export const timeseriesQuerySchema = z
  .object({
    granularity: z.enum(['day', 'month']).default('day'),
    // For 'day': how many days back. For 'month': how many months back.
    range: z.coerce.number().int().positive().max(365).default(30),
  })
  .strict();

export type TimeseriesQuery = z.infer<typeof timeseriesQuerySchema>;

export const topSendersQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(50).default(10),
  })
  .strict();

export type TopSendersQuery = z.infer<typeof topSendersQuerySchema>;

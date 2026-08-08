import { z } from 'zod';

import { EMAIL_AI_ACTIONS, EMAIL_AI_CATEGORIES, EMAIL_AI_PRIORITIES } from '../../models/email.model';

/**
 * Validates (and gracefully repairs) Gemini's JSON response for a single
 * email. `.catch(...)` on each field means a single malformed/hallucinated
 * field degrades to a safe default instead of failing the entire analysis —
 * an LLM drifting slightly off-spec on one field shouldn't discard a
 * perfectly good summary. See docs/AI_PIPELINE.md for the reasoning behind
 * validating at the application layer rather than via a Mongoose enum.
 */
export const emailAnalysisResponseSchema = z.object({
  summary: z
    .string()
    .trim()
    .min(1)
    .catch('Unable to generate a summary for this email.'),
  category: z.enum(EMAIL_AI_CATEGORIES).catch('personal'),
  priority: z.enum(EMAIL_AI_PRIORITIES).catch('medium'),
  action: z.enum(EMAIL_AI_ACTIONS).catch('archive'),
});

export type EmailAnalysisResult = z.infer<typeof emailAnalysisResponseSchema>;

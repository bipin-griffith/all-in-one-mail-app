import { EMAIL_AI_ACTIONS, EMAIL_AI_CATEGORIES, EMAIL_AI_PRIORITIES } from '../../models/email.model';

/**
 * Token-minimization decisions (see docs/AI_PIPELINE.md for the full
 * rationale):
 *  1. One call produces summary + category + priority + action together —
 *     not four separate completions each re-sending the same email body.
 *  2. The body is truncated to MAX_BODY_CHARS — classification and a 1-2
 *     sentence summary don't need the full text of a long email; the
 *     opening portion carries almost all of the useful signal.
 *  3. The system prompt is a short, fixed instruction set with no
 *     few-shot examples — examples would multiply the fixed per-call
 *     overhead across every single email processed.
 */
const MAX_BODY_CHARS = 3000;

export interface EmailAnalysisPromptInput {
  subject: string;
  from: string;
  bodyText: string;
}

export interface EmailAnalysisPrompt {
  system: string;
  user: string;
}

export function buildEmailAnalysisPrompt(input: EmailAnalysisPromptInput): EmailAnalysisPrompt {
  const truncatedBody =
    input.bodyText.length > MAX_BODY_CHARS
      ? `${input.bodyText.slice(0, MAX_BODY_CHARS)}…`
      : input.bodyText;

  const system = [
    'You triage emails for a busy professional.',
    'Given one email, respond with ONLY a single JSON object — no markdown, no explanation — with exactly these keys:',
    '"summary": a plain-text summary in 1-2 short sentences.',
    `"category": exactly one of: ${EMAIL_AI_CATEGORIES.join(', ')}.`,
    `"priority": exactly one of: ${EMAIL_AI_PRIORITIES.join(', ')}.`,
    `"action": exactly one of: ${EMAIL_AI_ACTIONS.join(', ')}.`,
  ].join('\n');

  const user = `From: ${input.from}\nSubject: ${input.subject}\n\n${truncatedBody || '(empty body)'}`;

  return { system, user };
}

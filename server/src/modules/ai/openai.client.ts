import OpenAI from 'openai';

import { env } from '../../config/env';

export const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export interface CompletionResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
}

export async function completeChat(
  systemPrompt: string,
  userPrompt: string,
): Promise<CompletionResult> {
  const response = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    temperature: 0.3,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  const content = response.choices[0]?.message?.content ?? '';

  return {
    content,
    promptTokens: response.usage?.prompt_tokens ?? 0,
    completionTokens: response.usage?.completion_tokens ?? 0,
  };
}

/**
 * Same shape as `completeChat`, but requests OpenAI's JSON mode
 * (`response_format: { type: 'json_object' }`) — used by the email
 * processing pipeline (docs/AI_PIPELINE.md) to get summary + category +
 * priority + action back from a *single* call instead of four separate
 * completions, which is the single biggest token-usage saving available:
 * the email content only has to be sent to OpenAI once, not four times.
 */
export async function completeJson(systemPrompt: string, userPrompt: string): Promise<CompletionResult> {
  const response = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  const content = response.choices[0]?.message?.content ?? '{}';

  return {
    content,
    promptTokens: response.usage?.prompt_tokens ?? 0,
    completionTokens: response.usage?.completion_tokens ?? 0,
  };
}

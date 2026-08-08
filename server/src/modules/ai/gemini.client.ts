import { GoogleGenAI } from '@google/genai';

import { env } from '../../config/env';

/**
 * Was `openai.client.ts` until this project switched providers to avoid
 * requiring prepaid OpenAI billing credits — Gemini's API key (from Google
 * AI Studio, ai.google.dev) works on a free tier with no payment method
 * required, subject to rate limits. Every call site elsewhere in the app
 * (`ai.service.ts`, `emailProcessing.service.ts`, `chat.service.ts`) only
 * imports `completeChat`/`completeJson` — this file is the *only* place
 * that knows which provider is actually behind them, which is exactly why
 * the swap didn't require touching anything else.
 */
export const genAI = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

export interface CompletionResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
}

/**
 * Gemini's `generateContent` has a `contents` field (the conversation) and
 * a separate `systemInstruction` config option for role-style guidance.
 * This app never needs multi-turn history in a single call, so the system
 * prompt and user prompt are folded into one `contents` string rather than
 * modeled as separate roles — one less moving part, and avoids depending
 * on `systemInstruction`'s exact shape for something a plain concatenation
 * achieves just as well here.
 */
function buildContents(systemPrompt: string, userPrompt: string): string {
  return `${systemPrompt}\n\n${userPrompt}`;
}

function toResult(response: {
  text?: string;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}): CompletionResult {
  return {
    content: response.text ?? '',
    promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
    completionTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

export async function completeChat(systemPrompt: string, userPrompt: string): Promise<CompletionResult> {
  const response = await genAI.models.generateContent({
    model: env.GEMINI_MODEL,
    contents: buildContents(systemPrompt, userPrompt),
    config: { temperature: 0.3 },
  });

  return toResult(response);
}

/**
 * Same shape as `completeChat`, but requests Gemini's JSON output mode
 * (`config.responseMimeType: 'application/json'`) — used by the email
 * processing pipeline (docs/AI_PIPELINE.md) to get summary + category +
 * priority + action back from a *single* call instead of four separate
 * completions, which is the single biggest token-usage saving available:
 * the email content only has to be sent to the model once, not four times.
 */
export async function completeJson(systemPrompt: string, userPrompt: string): Promise<CompletionResult> {
  const response = await genAI.models.generateContent({
    model: env.GEMINI_MODEL,
    contents: buildContents(systemPrompt, userPrompt),
    config: { temperature: 0.2, responseMimeType: 'application/json' },
  });

  const result = toResult(response);
  return { ...result, content: result.content || '{}' };
}

import { env } from '../../config/env';

import { openai } from './openai.client';

/**
 * Caps the text sent to the embeddings API. Semantic search doesn't need —
 * and shouldn't pay for — the full body of a long email; the subject plus
 * the opening portion of the body carries the vast majority of the topical
 * signal an embedding needs to capture. Mirrors the same truncation
 * philosophy used for chat prompts (docs/AI_PIPELINE.md).
 */
const MAX_EMBEDDING_INPUT_CHARS = 4000;

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  tokens: number;
}

/**
 * Wraps OpenAI's embeddings endpoint. Used both to embed every synced email
 * (emailProcessing.service.ts) and to embed an incoming chat question
 * (chat.service.ts) — both need the exact same model/dimensions, since a
 * query embedding is only comparable to document embeddings produced by the
 * same model.
 */
export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  const input = text.length > MAX_EMBEDDING_INPUT_CHARS ? text.slice(0, MAX_EMBEDDING_INPUT_CHARS) : text;

  const response = await openai.embeddings.create({
    model: env.OPENAI_EMBEDDING_MODEL,
    input: input || '(empty email)',
  });

  const vector = response.data[0]?.embedding;
  if (!vector) {
    throw new Error('OpenAI returned no embedding vector');
  }

  return {
    embedding: vector,
    model: env.OPENAI_EMBEDDING_MODEL,
    tokens: response.usage?.total_tokens ?? 0,
  };
}

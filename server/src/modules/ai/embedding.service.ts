import { env } from '../../config/env';

import { genAI } from './gemini.client';
import { EMBEDDING_DIMENSIONS } from './vectorSearch.service';

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
 * Wraps Gemini's embeddings endpoint (`embedContent`). Used both to embed
 * every synced email (emailProcessing.service.ts) and to embed an incoming
 * chat question (chat.service.ts) — both need the exact same
 * model/dimensions, since a query embedding is only comparable to document
 * embeddings produced by the same model.
 *
 * `outputDimensionality` is pinned to `EMBEDDING_DIMENSIONS` (1536) rather
 * than left at the model's default (3072) — Gemini's embedding model
 * supports Matryoshka Representation Learning, so truncating to a smaller,
 * still-valid dimensionality is an explicit, supported option, not a hack.
 * 1536 was chosen to match the Atlas Vector Search index definition
 * (`vectorSearch.service.ts`, `scripts/create-vector-index.ts`) — the two
 * numbers must always agree, which is why both reference the same constant
 * instead of each hardcoding it separately.
 */
export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  const input = text.length > MAX_EMBEDDING_INPUT_CHARS ? text.slice(0, MAX_EMBEDDING_INPUT_CHARS) : text;

  const response = await genAI.models.embedContent({
    model: env.GEMINI_EMBEDDING_MODEL,
    contents: input || '(empty email)',
    config: { outputDimensionality: EMBEDDING_DIMENSIONS },
  });

  const vector = response.embeddings?.[0]?.values;
  if (!vector) {
    throw new Error('Gemini returned no embedding vector');
  }

  return {
    embedding: vector,
    model: env.GEMINI_EMBEDDING_MODEL,
    tokens: response.embeddings?.[0]?.statistics?.tokenCount ?? 0,
  };
}

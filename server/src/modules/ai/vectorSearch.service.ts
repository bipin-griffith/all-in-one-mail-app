import { Types } from 'mongoose';

import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { Email } from '../../models/email.model';

/**
 * Must exactly match the `name` used when creating the Atlas Search vector
 * index (see server/scripts/create-vector-index.ts). Atlas Vector Search is
 * only available on Atlas clusters (M10+, or Search-enabled Flex/Serverless)
 * — local/community MongoDB (the docker-compose `mongo` service used for
 * local dev) cannot run `$vectorSearch` at all. See
 * docs/RAG_AND_DASHBOARDS.md for the full explanation and the brute-force
 * fallback this module uses instead when running locally.
 */
export const VECTOR_INDEX_NAME = 'email_vector_index';

/** text-embedding-3-small's output dimensionality — must match the index definition. */
export const EMBEDDING_DIMENSIONS = 1536;

/** How many candidate documents the brute-force fallback scores locally, capped for latency. */
const BRUTE_FORCE_CANDIDATE_LIMIT = 1000;

export interface EmailSearchResult {
  id: string;
  subject: string;
  from: string;
  receivedAt: Date;
  snippet: string;
  aiSummary: string | null;
  aiCategory: string | null;
  score: number;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

interface AtlasVectorSearchDoc {
  _id: Types.ObjectId;
  subject: string;
  from: string;
  receivedAt: Date;
  snippet: string;
  aiSummary: string | null;
  aiCategory: string | null;
  score: number;
}

/**
 * The production path: MongoDB Atlas Vector Search's `$vectorSearch`
 * aggregation stage does approximate-nearest-neighbor search directly in
 * the database, scoped to the caller's own mailboxes via the `filter`
 * clause (an indexed pre-filter, not a post-query JS filter) — this is what
 * makes it viable at scale in a way the brute-force fallback below isn't.
 */
async function searchWithAtlasVectorSearch(
  accountIds: string[],
  queryEmbedding: number[],
  limit: number,
): Promise<EmailSearchResult[]> {
  const results = await Email.aggregate<AtlasVectorSearchDoc>([
    {
      $vectorSearch: {
        index: VECTOR_INDEX_NAME,
        path: 'embedding',
        queryVector: queryEmbedding,
        // numCandidates should be well above `limit` so the ANN search has
        // enough of a pool to find the true nearest neighbors — Atlas's own
        // guidance is roughly 10-20x the requested limit.
        numCandidates: Math.max(limit * 15, 150),
        limit,
        filter: { emailAccount: { $in: accountIds.map((id) => new Types.ObjectId(id)) } },
      },
    },
    {
      $project: {
        subject: 1,
        from: 1,
        receivedAt: 1,
        snippet: 1,
        aiSummary: 1,
        aiCategory: 1,
        score: { $meta: 'vectorSearchScore' },
      },
    },
  ]);

  return results.map((doc) => ({
    id: doc._id.toString(),
    subject: doc.subject,
    from: doc.from,
    receivedAt: doc.receivedAt,
    snippet: doc.snippet,
    aiSummary: doc.aiSummary,
    aiCategory: doc.aiCategory,
    score: doc.score,
  }));
}

/**
 * Local-dev / non-Atlas fallback: pulls a bounded, recency-ordered pool of
 * the account's embedded emails and scores them in application code with
 * plain cosine similarity. This is O(candidates × dimensions) in Node, so
 * it deliberately does NOT scale the way `$vectorSearch` does — it exists
 * so the RAG feature is testable end-to-end against the local Docker
 * MongoDB used elsewhere in this project's dev workflow, not as a
 * production substitute.
 */
async function searchWithBruteForce(
  accountIds: string[],
  queryEmbedding: number[],
  limit: number,
): Promise<EmailSearchResult[]> {
  const candidates = await Email.find({
    emailAccount: { $in: accountIds },
    embeddingGeneratedAt: { $ne: null },
  })
    .select('+embedding subject from receivedAt snippet aiSummary aiCategory embedding')
    .sort({ receivedAt: -1 })
    .limit(BRUTE_FORCE_CANDIDATE_LIMIT);

  return candidates
    .map((email) => ({
      id: email.id as string,
      subject: email.subject,
      from: email.from,
      receivedAt: email.receivedAt,
      snippet: email.snippet,
      aiSummary: email.aiSummary,
      aiCategory: email.aiCategory,
      score: cosineSimilarity(queryEmbedding, email.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Finds the emails (scoped to the given mailboxes) whose content is most
 * semantically similar to `queryEmbedding`. Used by chat.service.ts to
 * retrieve context for RAG.
 *
 * Which path runs is controlled by `MONGO_ATLAS_VECTOR_SEARCH_ENABLED`
 * (explicit config, not auto-detection) — a deliberate choice: silently
 * falling back to a much-lower-quality search on a *misconfigured*
 * production Atlas index would be a confusing, hard-to-notice degradation.
 * The one exception is if Atlas search is enabled but the call itself
 * throws (e.g. the index doesn't exist yet) — that failure is caught and
 * degrades to brute-force rather than breaking the whole chat request.
 */
export async function searchSimilarEmails(
  accountIds: string[],
  queryEmbedding: number[],
  limit = 8,
): Promise<EmailSearchResult[]> {
  if (env.MONGO_ATLAS_VECTOR_SEARCH_ENABLED) {
    try {
      return await searchWithAtlasVectorSearch(accountIds, queryEmbedding, limit);
    } catch (err) {
      logger.error(
        `Atlas $vectorSearch failed (falling back to brute-force search): ${(err as Error).message}`,
      );
    }
  }

  return searchWithBruteForce(accountIds, queryEmbedding, limit);
}

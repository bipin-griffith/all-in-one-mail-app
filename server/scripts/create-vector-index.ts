import mongoose from 'mongoose';

import { env } from '../src/config/env';
import { logger } from '../src/config/logger';
import { EMBEDDING_DIMENSIONS, VECTOR_INDEX_NAME } from '../src/modules/ai/vectorSearch.service';

/**
 * One-time setup script — run manually against your Atlas cluster:
 *
 *   npx tsx scripts/create-vector-index.ts
 *
 * This ONLY works against MongoDB Atlas (M10+ cluster, or a Search-enabled
 * Flex/Serverless instance) — Atlas Search/Vector Search does not exist on
 * local or self-hosted community MongoDB, which is why this isn't run
 * automatically on app startup or folded into a Mongoose `.index()` call
 * (regular MongoDB indexes don't support vector/ANN search at all). See
 * docs/RAG_AND_DASHBOARDS.md.
 *
 * After this succeeds, set MONGO_ATLAS_VECTOR_SEARCH_ENABLED=true in your
 * Atlas-connected environment's .env so the app actually uses
 * `$vectorSearch` instead of the local brute-force fallback.
 */
async function main(): Promise<void> {
  await mongoose.connect(env.MONGO_URI);

  const collection = mongoose.connection.collection('emails');

  try {
    await collection.createSearchIndex({
      name: VECTOR_INDEX_NAME,
      type: 'vectorSearch',
      definition: {
        fields: [
          {
            type: 'vector',
            path: 'embedding',
            numDimensions: EMBEDDING_DIMENSIONS,
            similarity: 'cosine',
          },
          // Lets $vectorSearch's `filter` clause scope results to one
          // user's mailboxes as an indexed pre-filter, not a post-query scan.
          { type: 'filter', path: 'emailAccount' },
        ],
      },
    });

    logger.info(
      `Created Atlas Search vector index "${VECTOR_INDEX_NAME}" on emails.embedding (${EMBEDDING_DIMENSIONS} dims, cosine).`,
    );
    logger.info(
      'Index build is asynchronous on Atlas — check the Atlas UI (Search tab) until status is "Active" before relying on it.',
    );
  } catch (err) {
    logger.error(`Failed to create vector index: ${(err as Error).message}`);
    logger.error(
      'This only works against MongoDB Atlas (M10+, or Search-enabled Flex/Serverless) — not local/community MongoDB.',
    );
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main();

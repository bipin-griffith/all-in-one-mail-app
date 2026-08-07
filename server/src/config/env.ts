import 'dotenv/config';
import { z } from 'zod';

/**
 * Fail fast: if a required env var is missing or malformed, the process
 * refuses to start rather than crashing later mid-request in production.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  CLIENT_URL: z.string().url(),
  API_BASE_URL: z.string().url(),

  MONGO_URI: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  ENCRYPTION_KEY: z.string().min(32),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),

  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),

  // Set to 'true' once the Atlas Search vector index (see
  // server/scripts/create-vector-index.ts) exists on the target cluster.
  // Community/local MongoDB (e.g. the docker-compose `mongo` service) does
  // not support $vectorSearch at all — see docs/RAG_AND_DASHBOARDS.md.
  MONGO_ATLAS_VECTOR_SEARCH_ENABLED: z.coerce.boolean().default(false),

  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

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

  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().default('gemini-3.5-flash-lite'),
  GEMINI_EMBEDDING_MODEL: z.string().default('gemini-embedding-001'),

  // Set to 'true' once the Atlas Search vector index (see
  // server/scripts/create-vector-index.ts) exists on the target cluster.
  // Community/local MongoDB (e.g. the docker-compose `mongo` service) does
  // not support $vectorSearch at all — see docs/RAG_AND_DASHBOARDS.md.
  //
  // NOTE: this is intentionally NOT `z.coerce.boolean()`. `process.env`
  // values are always strings, and `Boolean("false")` is `true` in
  // JavaScript — that coercion would silently treat
  // `MONGO_ATLAS_VECTOR_SEARCH_ENABLED=false` as *enabled*. Same bug class
  // as the one fixed in email.validation.ts's `isRead` query param — see
  // that file's comment for the full explanation.
  MONGO_ATLAS_VECTOR_SEARCH_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

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

import { rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

import { isTest } from '../config/env';
import { redis } from '../config/redis';

function buildLimiter(opts: { windowMs: number; max: number; prefix: string }): RateLimitRequestHandler {
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    // Integration tests legitimately hit auth/AI endpoints far more times,
    // in far less wall-clock time, than any real user would (many test
    // files share one Redis instance and one rate-limit bucket keyed by
    // IP within the same run) — whether the rate limiter itself works is
    // a separate concern from whether the auth/AI endpoints behave
    // correctly, so it's disabled in NODE_ENV=test rather than tuned to
    // accommodate test volume (which would just weaken it for real users).
    skip: () => isTest,
    store: new RedisStore({
      // @ts-expect-error - ioredis `call` signature is compatible but not typed identically
      sendCommand: (...args: string[]) => redis.call(...args),
      prefix: opts.prefix,
    }),
    message: {
      success: false,
      message: 'Too many requests, please try again later.',
    },
  });
}

/** Tight limiter for auth endpoints — mitigates credential stuffing / brute force. */
export const authRateLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  prefix: 'rl:auth:',
});

/**
 * Limiter for AI endpoints — protects against Gemini API abuse (both cost
 * and free-tier rate limits), independent of plan quota. Deliberately scoped only to the action-triggering routes
 * (POST /ai/summarize etc.), never to GET /ai/jobs/:jobId — that endpoint is
 * polled every ~1.5s by the client while a job is in flight, which would
 * exhaust this same budget in seconds if it shared the bucket. See
 * ai.routes.ts.
 */
export const aiRateLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: 10,
  prefix: 'rl:ai:',
});

/**
 * Limiter for POST /chat — each request costs two Gemini calls (an
 * embedding + a chat completion), same cost class as the AI action routes,
 * so it gets its own bucket at the same rate rather than sharing (or
 * omitting) one.
 */
export const chatRateLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: 10,
  prefix: 'rl:chat:',
});

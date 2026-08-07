import { rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

import { redis } from '../config/redis';

function buildLimiter(opts: { windowMs: number; max: number; prefix: string }): RateLimitRequestHandler {
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
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
 * Limiter for AI endpoints — protects against OpenAI cost abuse, independent
 * of plan quota. Deliberately scoped only to the action-triggering routes
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
 * Limiter for POST /chat — each request costs two OpenAI calls (an
 * embedding + a chat completion), same cost class as the AI action routes,
 * so it gets its own bucket at the same rate rather than sharing (or
 * omitting) one.
 */
export const chatRateLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: 10,
  prefix: 'rl:chat:',
});

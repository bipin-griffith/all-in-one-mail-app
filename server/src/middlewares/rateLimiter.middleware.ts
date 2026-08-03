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

/** Limiter for AI endpoints — protects against OpenAI cost abuse, independent of plan quota. */
export const aiRateLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: 10,
  prefix: 'rl:ai:',
});

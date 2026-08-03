import IORedis, { type RedisOptions } from 'ioredis';

import { env } from './env';
import { logger } from './logger';

/**
 * BullMQ requires `maxRetriesPerRequest: null` on the connection it's given.
 * We centralize connection options here so both the API (for rate limiting)
 * and the worker/queues (BullMQ) share one config source.
 */
export const redisConnectionOptions: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

export function createRedisConnection(): IORedis {
  const connection = new IORedis(env.REDIS_URL, redisConnectionOptions);

  connection.on('error', (err) => {
    logger.error(`Redis connection error: ${err.message}`);
  });

  connection.on('connect', () => {
    logger.info('Redis connected');
  });

  return connection;
}

/** Shared connection for general app use (e.g. rate limiting store). */
export const redis = createRedisConnection();

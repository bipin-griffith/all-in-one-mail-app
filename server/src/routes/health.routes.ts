import { Router } from 'express';
import mongoose from 'mongoose';

import { logger } from '../config/logger';
import { redis } from '../config/redis';

const router = Router();

/**
 * Liveness — "is the process itself up and able to handle a request?" No
 * dependency checks on purpose: an orchestrator (ECS/k8s) or the AWS ALB
 * uses this to decide whether to kill/restart the container, so it must
 * never fail just because Mongo or Redis is briefly unreachable — that's
 * what /health/ready is for. See docs/OPERATIONS.md.
 */
router.get('/', (_req, res) => {
  res.status(200).json({ success: true, message: 'ok' });
});

/**
 * Readiness — "can this instance actually serve real traffic right now?"
 * Pings Mongo and Redis directly rather than trusting cached connection
 * state, since a load balancer removing an instance from rotation based on
 * a stale "looked fine a while ago" flag defeats the point of the check.
 * A load balancer/orchestrator polls this before routing traffic to a new
 * or recovering instance.
 */
router.get('/ready', async (_req, res) => {
  const checks = { mongo: false, redis: false };

  try {
    // NOTE: `mongoose.connection.db?.admin().ping()` looks equivalent but
    // is a real bug — when `db` is undefined (never connected), optional
    // chaining short-circuits the whole expression to `undefined` instead
    // of throwing, so `await undefined` resolves immediately and this
    // would report "ready" even with no database connection at all. A
    // readiness check that can report healthy while genuinely down is
    // worse than no check — it actively tells the load balancer to send
    // traffic somewhere that can't serve it.
    if (mongoose.connection.readyState !== mongoose.ConnectionStates.connected || !mongoose.connection.db) {
      throw new Error('MongoDB is not connected');
    }
    await mongoose.connection.db.admin().ping();
    checks.mongo = true;
  } catch (err) {
    logger.warn(`Readiness check: MongoDB ping failed: ${(err as Error).message}`);
  }

  try {
    await redis.ping();
    checks.redis = true;
  } catch (err) {
    logger.warn(`Readiness check: Redis ping failed: ${(err as Error).message}`);
  }

  const healthy = checks.mongo && checks.redis;
  res.status(healthy ? 200 : 503).json({
    success: healthy,
    message: healthy ? 'ready' : 'not ready',
    data: checks,
  });
});

export default router;

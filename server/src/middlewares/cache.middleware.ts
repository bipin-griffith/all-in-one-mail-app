import type { NextFunction, Request, Response } from 'express';

import { logger } from '../config/logger';
import { cacheHitsTotal, cacheMissesTotal } from '../config/metrics';
import { redis } from '../config/redis';
import { getRoutePattern } from '../utils/routePath';

/**
 * Caches successful (2xx) GET JSON responses in Redis. Applied to the
 * dashboard aggregation endpoints (dashboard.routes.ts) specifically — they
 * run non-trivial MongoDB aggregation pipelines over a user's full email
 * history on every request, but the underlying data changes at "new email
 * synced" cadence, not "every page view" cadence, so serving a
 * slightly-stale (≤ttlSeconds old) result is the right tradeoff. Matches
 * the client's own `staleTime` on these queries (see
 * client/src/features/dashboard/hooks) — client and server agree on how
 * fresh this data needs to be.
 *
 * Cache key is scoped to `userId + full URL` (including query string) —
 * this is what makes it safe: different filters/pagination never collide,
 * and it is structurally impossible for one user's cached aggregate to be
 * served to another user, since the key always includes their own id.
 *
 * A cache failure (Redis hiccup) degrades to "just run the query" rather
 * than failing the request — caching is a performance optimization here,
 * not a correctness dependency.
 */
export function cacheResponse(ttlSeconds: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userId = req.user?.sub;
    if (!userId) {
      next();
      return;
    }

    const cacheKey = `cache:${userId}:${req.originalUrl}`;
    const routeLabel = req.baseUrl + (getRoutePattern(req) ?? '');

    void (async () => {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          cacheHitsTotal.inc({ route: routeLabel });
          res.setHeader('X-Cache', 'HIT');
          res.status(200).json(JSON.parse(cached) as unknown);
          return;
        }
      } catch (err) {
        logger.warn(`Cache read failed for ${cacheKey}: ${(err as Error).message}`);
      }

      cacheMissesTotal.inc({ route: routeLabel });
      res.setHeader('X-Cache', 'MISS');

      const originalJson = res.json.bind(res);
      res.json = ((body: unknown) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          redis.set(cacheKey, JSON.stringify(body), 'EX', ttlSeconds).catch((err: Error) => {
            logger.warn(`Cache write failed for ${cacheKey}: ${err.message}`);
          });
        }
        return originalJson(body);
      }) as Response['json'];

      next();
    })();
  };
}

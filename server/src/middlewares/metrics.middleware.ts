import type { NextFunction, Request, Response } from 'express';

import { httpRequestDuration, httpRequestsTotal } from '../config/metrics';
import { getRoutePattern } from '../utils/routePath';

/**
 * Records every request's duration and outcome as Prometheus metrics.
 * Mounted globally in app.ts, ahead of routing, so it captures 404s and
 * error responses too, not just successful route matches.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    // req.route is only populated once Express resolves a matching route —
    // for a 404, fall back to the raw path so metrics don't group every
    // unmatched request under one giant "undefined" bucket, while still
    // avoiding unbounded label cardinality from arbitrary query strings
    // (req.path excludes the query string; the route pattern is e.g.
    // "/:id", not the literal id).
    const routePattern = getRoutePattern(req);
    const route = routePattern ? `${req.baseUrl}${routePattern}` : req.path;
    const labels = { method: req.method, route, status_code: String(res.statusCode) };
    httpRequestDuration.observe(labels, durationSeconds);
    httpRequestsTotal.inc(labels);
  });

  next();
}

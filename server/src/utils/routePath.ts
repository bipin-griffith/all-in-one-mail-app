import type { Request } from 'express';

/**
 * `req.route` is typed `any` in @types/express (it has no way to know your
 * route definitions' shapes), so every access needs an explicit cast
 * somewhere — centralized here once instead of repeated in every
 * middleware that needs "which route pattern matched" (metrics + cache
 * middleware both do). Returns the route *pattern* (e.g. "/:id"), not the
 * literal URL, and only once Express has actually matched a route — it's
 * `undefined` for anything that 404s before reaching a route handler.
 */
export function getRoutePattern(req: Request): string | undefined {
  const route = req.route as { path?: string } | undefined;
  return route?.path;
}

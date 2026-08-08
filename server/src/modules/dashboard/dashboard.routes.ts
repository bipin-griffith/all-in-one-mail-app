import { Router } from 'express';

import { authenticate } from '../../middlewares/auth.middleware';
import { cacheResponse } from '../../middlewares/cache.middleware';
import { validate } from '../../middlewares/validate.middleware';

import * as dashboardController from './dashboard.controller';
import { categoryParamSchema, timeseriesQuerySchema, topSendersQuerySchema } from './dashboard.validation';

const router = Router();
router.use(authenticate);

// 60s TTL matches the client's own staleTime on these queries (see
// client/src/features/dashboard/hooks) — client and server agree on how
// fresh this data needs to be. See cache.middleware.ts for the full
// rationale (why these endpoints specifically, why it's safe per-user).
const DASHBOARD_CACHE_TTL_SECONDS = 60;

// Unread Emails / Priority Emails dashboards intentionally have no routes
// here — they're just GET /emails?isRead=false and GET /emails?aiPriority=high,
// reusing the existing filtered list endpoint rather than duplicating it.
router.get(
  '/category/:aiCategory',
  cacheResponse(DASHBOARD_CACHE_TTL_SECONDS),
  validate({ params: categoryParamSchema }),
  dashboardController.getCategoryDashboard,
);
router.get(
  '/stats',
  cacheResponse(DASHBOARD_CACHE_TTL_SECONDS),
  validate({ query: timeseriesQuerySchema }),
  dashboardController.getTimeseriesStats,
);
router.get(
  '/top-senders',
  cacheResponse(DASHBOARD_CACHE_TTL_SECONDS),
  validate({ query: topSendersQuerySchema }),
  dashboardController.getTopSenders,
);

export default router;

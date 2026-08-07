import { Router } from 'express';

import { authenticate } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';

import * as dashboardController from './dashboard.controller';
import { categoryParamSchema, timeseriesQuerySchema, topSendersQuerySchema } from './dashboard.validation';

const router = Router();
router.use(authenticate);

// Unread Emails / Priority Emails dashboards intentionally have no routes
// here — they're just GET /emails?isRead=false and GET /emails?aiPriority=high,
// reusing the existing filtered list endpoint rather than duplicating it.
router.get(
  '/category/:aiCategory',
  validate({ params: categoryParamSchema }),
  dashboardController.getCategoryDashboard,
);
router.get('/stats', validate({ query: timeseriesQuerySchema }), dashboardController.getTimeseriesStats);
router.get(
  '/top-senders',
  validate({ query: topSendersQuerySchema }),
  dashboardController.getTopSenders,
);

export default router;

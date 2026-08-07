import type { Request, Response } from 'express';

import { HttpStatus } from '../../constants/httpStatus';
import type { EmailAiCategory } from '../../models/email.model';
import { sendSuccess } from '../../utils/ApiResponse';
import { asyncHandler } from '../../utils/asyncHandler';

import * as dashboardService from './dashboard.service';
import type { TimeseriesQuery, TopSendersQuery } from './dashboard.validation';

/** GET /dashboard/category/:aiCategory — powers the Jobs/Shopping/Finance dashboards. */
export const getCategoryDashboard = asyncHandler(async (req: Request, res: Response) => {
  const aiCategory = req.params.aiCategory as EmailAiCategory;
  const dashboard = await dashboardService.getCategoryDashboard(req.user!.sub, aiCategory);
  sendSuccess(res, HttpStatus.OK, 'Category dashboard', dashboard);
});

/** GET /dashboard/stats — powers Daily Statistics and Monthly Statistics. */
export const getTimeseriesStats = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as TimeseriesQuery;
  const stats = await dashboardService.getTimeseriesStats(req.user!.sub, query.granularity, query.range);
  sendSuccess(res, HttpStatus.OK, 'Timeseries stats', stats);
});

/** GET /dashboard/top-senders */
export const getTopSenders = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as TopSendersQuery;
  const senders = await dashboardService.getTopSenders(req.user!.sub, query.limit);
  sendSuccess(res, HttpStatus.OK, 'Top senders', senders);
});

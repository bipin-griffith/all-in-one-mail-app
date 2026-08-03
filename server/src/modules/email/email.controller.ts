import type { Request, Response } from 'express';

import { HttpStatus } from '../../constants/httpStatus';
import { sendSuccess } from '../../utils/ApiResponse';
import { asyncHandler } from '../../utils/asyncHandler';

import * as emailService from './email.service';
import type { ListThreadsQuery, UpdateThreadInput } from './email.validation';

export const listEmailAccounts = asyncHandler(async (req: Request, res: Response) => {
  const accounts = await emailService.listEmailAccounts(req.user!.sub);
  sendSuccess(res, HttpStatus.OK, 'Connected accounts', accounts);
});

export const disconnectEmailAccount = asyncHandler(async (req: Request, res: Response) => {
  await emailService.disconnectEmailAccount(req.user!.sub, req.params.id as string);
  sendSuccess(res, HttpStatus.NO_CONTENT, 'Account disconnected', null);
});

export const syncEmailAccount = asyncHandler(async (req: Request, res: Response) => {
  const jobId = await emailService.triggerSync(req.user!.sub, req.params.id as string);
  sendSuccess(res, HttpStatus.ACCEPTED, 'Sync started', { jobId });
});

export const listThreads = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListThreadsQuery;
  const { items, total, page, limit } = await emailService.listThreads(req.user!.sub, query);
  sendSuccess(res, HttpStatus.OK, 'Threads fetched', items, { page, limit, total });
});

export const getThread = asyncHandler(async (req: Request, res: Response) => {
  const result = await emailService.getThreadDetail(req.user!.sub, req.params.id as string);
  sendSuccess(res, HttpStatus.OK, 'Thread fetched', result);
});

export const updateThread = asyncHandler(async (req: Request, res: Response) => {
  const patch = req.body as UpdateThreadInput;
  const thread = await emailService.updateThread(req.user!.sub, req.params.id as string, patch);
  sendSuccess(res, HttpStatus.OK, 'Thread updated', thread);
});

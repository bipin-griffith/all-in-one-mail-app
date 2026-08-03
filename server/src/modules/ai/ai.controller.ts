import type { Request, Response } from 'express';

import { HttpStatus } from '../../constants/httpStatus';
import { sendSuccess } from '../../utils/ApiResponse';
import { asyncHandler } from '../../utils/asyncHandler';

import * as aiService from './ai.service';
import type { DraftReplyInput, SummarizeInput } from './ai.validation';

export const summarize = asyncHandler(async (req: Request<unknown, unknown, SummarizeInput>, res) => {
  const { jobId } = await aiService.enqueueSummarize(req.user!.sub, req.body.threadId);
  sendSuccess(res, HttpStatus.ACCEPTED, 'Summarization queued', { jobId });
});

export const draftReply = asyncHandler(async (req: Request<unknown, unknown, DraftReplyInput>, res) => {
  const { jobId } = await aiService.enqueueDraftReply(req.user!.sub, req.body.threadId);
  sendSuccess(res, HttpStatus.ACCEPTED, 'Draft reply queued', { jobId });
});

export const classify = asyncHandler(async (req: Request<unknown, unknown, SummarizeInput>, res) => {
  const { jobId } = await aiService.enqueueClassify(req.user!.sub, req.body.threadId);
  sendSuccess(res, HttpStatus.ACCEPTED, 'Classification queued', { jobId });
});

export const getJob = asyncHandler(async (req: Request, res: Response) => {
  const interaction = await aiService.getJobStatus(req.user!.sub, req.params.jobId as string);
  sendSuccess(res, HttpStatus.OK, 'Job status', interaction);
});

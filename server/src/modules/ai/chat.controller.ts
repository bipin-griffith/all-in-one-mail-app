import type { Request, Response } from 'express';

import { HttpStatus } from '../../constants/httpStatus';
import { sendSuccess } from '../../utils/ApiResponse';
import { asyncHandler } from '../../utils/asyncHandler';

import * as chatService from './chat.service';
import type { ChatRequestInput } from './chat.validation';

export const chat = asyncHandler(
  async (req: Request<unknown, unknown, ChatRequestInput>, res: Response) => {
    const result = await chatService.askQuestion(req.user!.sub, req.body.message);
    sendSuccess(res, HttpStatus.OK, 'Answer generated', result);
  },
);

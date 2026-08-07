import { Router } from 'express';

import { authenticate } from '../../middlewares/auth.middleware';
import { chatRateLimiter } from '../../middlewares/rateLimiter.middleware';
import { validate } from '../../middlewares/validate.middleware';

import * as chatController from './chat.controller';
import { chatRequestSchema } from './chat.validation';

const router = Router();

router.post(
  '/',
  authenticate,
  chatRateLimiter,
  validate({ body: chatRequestSchema }),
  chatController.chat,
);

export default router;

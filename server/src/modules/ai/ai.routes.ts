import { Router } from 'express';

import { authenticate } from '../../middlewares/auth.middleware';
import { aiRateLimiter } from '../../middlewares/rateLimiter.middleware';
import { validate } from '../../middlewares/validate.middleware';

import * as aiController from './ai.controller';
import { classifySchema, draftReplySchema, jobIdParamSchema, summarizeSchema } from './ai.validation';

const router = Router();
router.use(authenticate);

// aiRateLimiter only guards the endpoints that actually trigger a Gemini
// call — GET /jobs/:jobId is a cheap Mongo read that the client polls every
// ~1.5s while a job is in flight (see client's useAiJob hook), which would
// blow through a 10-req/min limit within seconds if it shared the same
// bucket as the action-triggering routes below.
router.post('/summarize', aiRateLimiter, validate({ body: summarizeSchema }), aiController.summarize);
router.post(
  '/draft-reply',
  aiRateLimiter,
  validate({ body: draftReplySchema }),
  aiController.draftReply,
);
router.post('/classify', aiRateLimiter, validate({ body: classifySchema }), aiController.classify);
router.get('/jobs/:jobId', validate({ params: jobIdParamSchema }), aiController.getJob);

export default router;

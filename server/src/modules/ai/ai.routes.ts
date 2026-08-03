import { Router } from 'express';

import { authenticate } from '../../middlewares/auth.middleware';
import { aiRateLimiter } from '../../middlewares/rateLimiter.middleware';
import { validate } from '../../middlewares/validate.middleware';

import * as aiController from './ai.controller';
import { classifySchema, draftReplySchema, jobIdParamSchema, summarizeSchema } from './ai.validation';

const router = Router();
router.use(authenticate, aiRateLimiter);

router.post('/summarize', validate({ body: summarizeSchema }), aiController.summarize);
router.post('/draft-reply', validate({ body: draftReplySchema }), aiController.draftReply);
router.post('/classify', validate({ body: classifySchema }), aiController.classify);
router.get('/jobs/:jobId', validate({ params: jobIdParamSchema }), aiController.getJob);

export default router;

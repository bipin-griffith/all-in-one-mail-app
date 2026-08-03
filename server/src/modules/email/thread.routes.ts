import { Router } from 'express';

import { authenticate } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';

import * as emailController from './email.controller';
import { listThreadsQuerySchema, threadIdParamSchema, updateThreadSchema } from './email.validation';

const router = Router();
router.use(authenticate);

router.get('/', validate({ query: listThreadsQuerySchema }), emailController.listThreads);
router.get('/:id', validate({ params: threadIdParamSchema }), emailController.getThread);
router.patch(
  '/:id',
  validate({ params: threadIdParamSchema, body: updateThreadSchema }),
  emailController.updateThread,
);

export default router;

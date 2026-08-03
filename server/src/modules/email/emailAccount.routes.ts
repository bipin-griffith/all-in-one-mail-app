import { Router } from 'express';

import { authenticate } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';

import * as emailController from './email.controller';
import { emailAccountIdParamSchema } from './email.validation';

const router = Router();
router.use(authenticate);

router.get('/', emailController.listEmailAccounts);
router.post(
  '/:id/sync',
  validate({ params: emailAccountIdParamSchema }),
  emailController.syncEmailAccount,
);
router.delete(
  '/:id',
  validate({ params: emailAccountIdParamSchema }),
  emailController.disconnectEmailAccount,
);

export default router;

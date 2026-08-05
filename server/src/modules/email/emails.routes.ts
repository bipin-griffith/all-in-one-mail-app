import { Router } from 'express';

import { authenticate } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';

import * as emailController from './email.controller';
import { attachmentParamSchema, emailIdParamSchema, listEmailsQuerySchema } from './email.validation';

const router = Router();
router.use(authenticate);

router.get('/', validate({ query: listEmailsQuerySchema }), emailController.listEmails);
router.get('/:id', validate({ params: emailIdParamSchema }), emailController.getEmail);
router.get(
  '/:id/attachments/:attachmentId',
  validate({ params: attachmentParamSchema }),
  emailController.downloadAttachment,
);

export default router;

import { Router } from 'express';

import { authenticate } from '../../middlewares/auth.middleware';

import * as emailController from './email.controller';

const router = Router();

router.post('/', authenticate, emailController.syncAll);

export default router;

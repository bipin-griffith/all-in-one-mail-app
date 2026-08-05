import { Router } from 'express';

import { authenticate } from '../../middlewares/auth.middleware';
import { authRateLimiter } from '../../middlewares/rateLimiter.middleware';
import { validate } from '../../middlewares/validate.middleware';

import * as authController from './auth.controller';
import { loginSchema, registerSchema, sessionIdParamSchema } from './auth.validation';

const router = Router();

router.post('/register', authRateLimiter, validate({ body: registerSchema }), authController.register);
router.post('/login', authRateLimiter, validate({ body: loginSchema }), authController.login);

router.get('/google', authController.redirectToGoogle);
router.get('/google/callback', authController.googleCallback);

router.post('/refresh', authController.refresh);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.me);

// Session management — see docs/AUTH_AND_GMAIL.md
router.get('/sessions', authenticate, authController.listSessions);
router.delete('/sessions', authenticate, authController.revokeOtherSessions);
router.delete(
  '/sessions/:id',
  authenticate,
  validate({ params: sessionIdParamSchema }),
  authController.revokeSession,
);

export default router;

import { Router } from 'express';

import aiRoutes from '../modules/ai/ai.routes';
import authRoutes from '../modules/auth/auth.routes';
import emailAccountRoutes from '../modules/email/emailAccount.routes';
import emailsRoutes from '../modules/email/emails.routes';
import syncRoutes from '../modules/email/sync.routes';
import threadRoutes from '../modules/email/thread.routes';

const router = Router();

router.get('/health', (_req, res) => res.status(200).json({ success: true, message: 'ok' }));

router.use('/auth', authRoutes);
router.use('/email-accounts', emailAccountRoutes);
router.use('/threads', threadRoutes);
router.use('/emails', emailsRoutes);
router.use('/sync', syncRoutes);
router.use('/ai', aiRoutes);

export default router;

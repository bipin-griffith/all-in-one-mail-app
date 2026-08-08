import { Router } from 'express';

import aiRoutes from '../modules/ai/ai.routes';
import chatRoutes from '../modules/ai/chat.routes';
import authRoutes from '../modules/auth/auth.routes';
import dashboardRoutes from '../modules/dashboard/dashboard.routes';
import emailAccountRoutes from '../modules/email/emailAccount.routes';
import emailsRoutes from '../modules/email/emails.routes';
import syncRoutes from '../modules/email/sync.routes';
import threadRoutes from '../modules/email/thread.routes';

const router = Router();

// Health/readiness moved to top-level /health (not versioned API surface —
// see app.ts). No route here anymore; this comment exists so the move
// isn't mistaken for an oversight.

router.use('/auth', authRoutes);
router.use('/email-accounts', emailAccountRoutes);
router.use('/threads', threadRoutes);
router.use('/emails', emailsRoutes);
router.use('/sync', syncRoutes);
router.use('/ai', aiRoutes);
router.use('/chat', chatRoutes);
router.use('/dashboard', dashboardRoutes);

export default router;

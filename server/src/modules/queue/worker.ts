import { connectDB } from '../../config/db';
import { logger } from '../../config/logger';

import { createAiWorker } from './workers/ai.worker';
import { createEmailSyncWorker } from './workers/emailSync.worker';

/**
 * Standalone worker process entrypoint — run as `node dist/modules/queue/worker.js`,
 * a separate container/process from the API (see docker-compose.yml, `worker` service).
 * Scales independently of API request capacity.
 */
async function bootstrap(): Promise<void> {
  await connectDB();

  const emailSyncWorker = createEmailSyncWorker();
  const aiWorker = createAiWorker();

  logger.info('Worker process started (email-sync, ai-processing)');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received, shutting down worker gracefully`);
    await Promise.all([emailSyncWorker.close(), aiWorker.close()]);
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err: unknown) => {
  logger.error(`Worker failed to start: ${(err as Error).message}`);
  process.exit(1);
});

import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { env, isProduction } from './config/env';
import { httpLogStream, logger } from './config/logger';
import { metricsRegistry } from './config/metrics';
import { errorHandler } from './middlewares/error.middleware';
import { metricsMiddleware } from './middlewares/metrics.middleware';
import { notFoundHandler } from './middlewares/notFound.middleware';
import apiRoutes from './routes';
import healthRoutes from './routes/health.routes';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind an ALB/Nginx in production

  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(morgan(isProduction ? 'combined' : 'dev', { stream: httpLogStream }));
  app.use(metricsMiddleware);

  // Outside /api/v1 on purpose: these are infra-facing, not product API
  // surface (an ALB health check and a Prometheus/CloudWatch scrape target,
  // not something the frontend calls). /metrics has no app-level auth — see
  // config/metrics.ts for why that's fine here (network isolation, not
  // app-layer auth, is what protects it).
  app.use('/health', healthRoutes);
  app.get('/metrics', (_req, res) => {
    metricsRegistry
      .metrics()
      .then((metrics) => {
        res.setHeader('Content-Type', metricsRegistry.contentType);
        res.send(metrics);
      })
      .catch((err: Error) => {
        logger.error(`Failed to collect metrics: ${err.message}`);
        res.status(500).send('');
      });
  });

  app.use('/api/v1', apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

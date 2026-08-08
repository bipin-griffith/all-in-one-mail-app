import winston from 'winston';

import { isProduction } from './env';

const { combine, timestamp, errors, printf, colorize, json } = winston.format;

const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack }) => {
    return `${String(ts)} ${level}: ${String(stack ?? message)}`;
  }),
);

const prodFormat = combine(timestamp(), errors({ stack: true }), json());

/**
 * Console-only, even in production — logs are never written to local files.
 * This is deliberate, not an oversight: the app runs in Docker containers
 * whose filesystem is ephemeral (a redeploy or restart discards it), and
 * the non-root user those containers run as (see server/Dockerfile) has no
 * write access to create a log directory in the image anyway. Structured
 * JSON on stdout is what Docker's `awslogs` logging driver
 * (docker-compose.prod.yml) captures and ships to CloudWatch — that's the
 * one source of truth for production logs, not a file inside the
 * container. See docs/OPERATIONS.md.
 */
export const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  format: isProduction ? prodFormat : devFormat,
  defaultMeta: { service: 'ai-mail-server' },
  transports: [new winston.transports.Console()],
  exitOnError: false,
});

/** Stream adapter so `morgan` (HTTP access logs) can pipe into Winston. */
export const httpLogStream = {
  write: (message: string): void => {
    logger.http(message.trim());
  },
};

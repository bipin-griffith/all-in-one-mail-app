import path from 'node:path';

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

export const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  format: isProduction ? prodFormat : devFormat,
  defaultMeta: { service: 'ai-mail-server' },
  transports: [
    new winston.transports.Console(),
    ...(isProduction
      ? [
          new winston.transports.File({
            filename: path.join('logs', 'error.log'),
            level: 'error',
          }),
          new winston.transports.File({ filename: path.join('logs', 'combined.log') }),
        ]
      : []),
  ],
  exitOnError: false,
});

/** Stream adapter so `morgan` (HTTP access logs) can pipe into Winston. */
export const httpLogStream = {
  write: (message: string): void => {
    logger.http(message.trim());
  },
};

import mongoose from 'mongoose';

import { env } from './env';
import { logger } from './logger';

mongoose.set('strictQuery', true);

export async function connectDB(): Promise<void> {
  mongoose.connection.on('error', (err) => {
    logger.error(`MongoDB connection error: ${(err as Error).message}`);
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });

  await mongoose.connect(env.MONGO_URI);
  logger.info(`MongoDB connected: ${mongoose.connection.host}`);
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}

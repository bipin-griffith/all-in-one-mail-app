import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';

import { isProduction } from '../config/env';
import { logger } from '../config/logger';
import { HttpStatus } from '../constants/httpStatus';
import { ApiError, type FieldError } from '../utils/ApiError';

/** Normalizes any thrown value (ApiError, Mongoose error, or unknown) into an ApiError. */
function normalizeError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  if (err instanceof mongoose.Error.ValidationError) {
    const errors: FieldError[] = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return ApiError.badRequest('Validation failed', errors);
  }

  if (err instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid value for field "${err.path}"`);
  }

  if (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: number }).code === 11000
  ) {
    return ApiError.conflict('A resource with these details already exists');
  }

  if (err instanceof Error && err.name === 'TokenExpiredError') {
    return ApiError.unauthorized('Token has expired');
  }

  if (err instanceof Error && err.name === 'JsonWebTokenError') {
    return ApiError.unauthorized('Invalid token');
  }

  const message = err instanceof Error ? err.message : 'Something went wrong';
  return ApiError.internal(message);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const apiError = normalizeError(err);

  if (!apiError.isOperational || apiError.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
    logger.error(`${req.method} ${req.originalUrl} - ${apiError.message}`, {
      stack: apiError.stack,
    });
  } else {
    logger.warn(`${req.method} ${req.originalUrl} - ${apiError.message}`);
  }

  res.status(apiError.statusCode).json({
    success: false,
    message: apiError.message,
    ...(apiError.errors ? { errors: apiError.errors } : {}),
    ...(isProduction ? {} : { stack: apiError.stack }),
  });
}

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny } from 'zod';

import { ApiError } from '../utils/ApiError';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

/**
 * Validates and REPLACES req.body/params/query with the parsed (and
 * type-coerced) result, so downstream code can trust the shape matches the
 * schema exactly — including stripping unknown keys for `.strict()` schemas.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        return next(
          ApiError.badRequest(
            'Validation failed',
            result.error.issues.map((issue) => ({
              field: issue.path.join('.'),
              message: issue.message,
            })),
          ),
        );
      }
      // ZodTypeAny erases the schema's specific output shape by design, so this
      // generic middleware can accept any schema — the assignment is inherently `any`.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      req.body = result.data;
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        return next(
          ApiError.badRequest(
            'Invalid route parameters',
            result.error.issues.map((issue) => ({
              field: issue.path.join('.'),
              message: issue.message,
            })),
          ),
        );
      }
      req.params = result.data as typeof req.params;
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        return next(
          ApiError.badRequest(
            'Invalid query parameters',
            result.error.issues.map((issue) => ({
              field: issue.path.join('.'),
              message: issue.message,
            })),
          ),
        );
      }
      req.query = result.data as typeof req.query;
    }

    next();
  };
}

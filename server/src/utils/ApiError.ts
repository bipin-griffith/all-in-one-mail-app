import type { HttpStatusCode } from '../constants/httpStatus';

export interface FieldError {
  field: string;
  message: string;
}

/**
 * The only way business logic should signal failure. Thrown anywhere in the
 * route → controller → service chain and caught centrally by
 * `error.middleware.ts`, which shapes it into the standard error envelope.
 */
export class ApiError extends Error {
  public readonly statusCode: HttpStatusCode;
  public readonly isOperational: boolean;
  public readonly errors?: FieldError[];

  constructor(
    statusCode: HttpStatusCode,
    message: string,
    options?: { errors?: FieldError[]; isOperational?: boolean },
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = options?.errors;
    this.isOperational = options?.isOperational ?? true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, errors?: FieldError[]): ApiError {
    return new ApiError(400, message, { errors });
  }

  static unauthorized(message = 'Unauthorized'): ApiError {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Forbidden'): ApiError {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found'): ApiError {
    return new ApiError(404, message);
  }

  static conflict(message: string): ApiError {
    return new ApiError(409, message);
  }

  static internal(message = 'Something went wrong'): ApiError {
    return new ApiError(500, message, { isOperational: false });
  }
}

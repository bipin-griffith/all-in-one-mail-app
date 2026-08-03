import type { Response } from 'express';

import type { HttpStatusCode } from '../constants/httpStatus';

export interface ApiResponseMeta {
  page?: number;
  limit?: number;
  total?: number;
  [key: string]: unknown;
}

/**
 * Every successful response in the API is shaped through this helper so the
 * client can rely on one envelope shape everywhere. See docs/API.md.
 */
export class ApiResponse<T> {
  public readonly success = true as const;

  constructor(
    public readonly statusCode: HttpStatusCode,
    public readonly message: string,
    public readonly data: T,
    public readonly meta?: ApiResponseMeta,
  ) {}

  send(res: Response): Response {
    return res.status(this.statusCode).json({
      success: this.success,
      message: this.message,
      data: this.data,
      ...(this.meta ? { meta: this.meta } : {}),
    });
  }
}

export function sendSuccess<T>(
  res: Response,
  statusCode: HttpStatusCode,
  message: string,
  data: T,
  meta?: ApiResponseMeta,
): Response {
  return new ApiResponse(statusCode, message, data, meta).send(res);
}

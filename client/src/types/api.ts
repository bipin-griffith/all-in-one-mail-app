/** Mirrors the server's response envelope — see server/src/utils/ApiResponse.ts and docs/API.md. */
export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
  meta?: { page?: number; limit?: number; total?: number; [key: string]: unknown };
}

export interface ApiFieldError {
  field: string;
  message: string;
}

export interface ApiErrorBody {
  success: false;
  message: string;
  errors?: ApiFieldError[];
}

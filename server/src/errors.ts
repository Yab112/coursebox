export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, "bad_request", message, details);
export const unauthorized = (message = "Sign in required") => new AppError(401, "unauthorized", message);
export const notFound = (what = "Not found") => new AppError(404, "not_found", what);
export const conflict = (code: string, message: string, details?: unknown) => new AppError(409, code, message, details);
export const tooLarge = (message: string) => new AppError(413, "too_large", message);

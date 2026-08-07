export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, code = "BAD_REQUEST") =>
  new AppError(400, message, code);
export const unauthorized = (message = "Authentication required") =>
  new AppError(401, message, "UNAUTHORIZED");
export const forbidden = (message = "You do not have permission to perform this action") =>
  new AppError(403, message, "FORBIDDEN");
export const notFound = (resource: string) =>
  new AppError(404, `${resource} not found`, "NOT_FOUND");
export const conflict = (message: string, code = "CONFLICT") => new AppError(409, message, code);

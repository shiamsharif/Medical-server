import type { Response } from "express";

export function success(
  response: Response,
  data: unknown,
  message = "Request completed successfully",
  status = 200,
): void {
  response.status(status).json({ success: true, message, data });
}

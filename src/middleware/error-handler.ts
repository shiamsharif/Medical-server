import type { ErrorRequestHandler, RequestHandler } from "express";
import { MongoServerError } from "mongodb";
import Stripe from "stripe";
import { ZodError } from "zod";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { AppError } from "../errors/app-error.js";

function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new AppError(400, "Request validation failed", "VALIDATION_ERROR", error.flatten());
  }

  if (error instanceof MongoServerError && error.code === 11000) {
    return new AppError(409, "A conflicting record already exists", "DUPLICATE_RESOURCE");
  }

  if (error instanceof Stripe.errors.StripeError) {
    return new AppError(502, "Payment provider request failed", "PAYMENT_PROVIDER_ERROR");
  }

  return new AppError(500, "An unexpected error occurred", "INTERNAL_SERVER_ERROR");
}

export const notFoundHandler: RequestHandler = (request, response) => {
  response.status(404).json({
    success: false,
    message: "API route not found",
    error: { code: "ROUTE_NOT_FOUND", path: request.path },
  });
};

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  const appError = normalizeError(error);

  logger.error(
    { err: error, method: request.method, path: request.path, code: appError.code },
    "Request failed",
  );
  response.status(appError.statusCode).json({
    success: false,
    message: appError.message,
    error: {
      code: appError.code,
      ...(appError.details !== undefined ? { details: appError.details } : {}),
      ...(env.NODE_ENV !== "production" && error instanceof Error ? { stack: error.stack } : {}),
    },
  });
};

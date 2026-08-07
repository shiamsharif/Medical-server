import type { ErrorRequestHandler, RequestHandler } from "express";
import { MongoServerError } from "mongodb";
import Stripe from "stripe";
import { ZodError } from "zod";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { AppError } from "../errors/app-error.js";

export const notFoundHandler: RequestHandler = (request, response) => {
  response.status(404).json({ success: false, message: "API route not found", error: { code: "ROUTE_NOT_FOUND", path: request.path } });
};

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  let appError: AppError;
  if (error instanceof AppError) appError = error;
  else if (error instanceof ZodError) appError = new AppError(400, "Request validation failed", "VALIDATION_ERROR", error.flatten());
  else if (error instanceof MongoServerError && error.code === 11000) appError = new AppError(409, "A conflicting record already exists", "DUPLICATE_RESOURCE");
  else if (error instanceof Stripe.errors.StripeError) appError = new AppError(502, "Payment provider request failed", "PAYMENT_PROVIDER_ERROR");
  else appError = new AppError(500, "An unexpected error occurred", "INTERNAL_SERVER_ERROR");

  logger.error({ err: error, method: request.method, path: request.path, code: appError.code }, "Request failed");
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

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { pinoHttp } from "pino-http";
import { toNodeHandler } from "better-auth/node";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { auth } from "./auth/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { usersRouter } from "./modules/users/users.routes.js";
import { doctorsRouter } from "./modules/doctors/doctors.routes.js";
import { schedulesRouter } from "./modules/schedules/schedules.routes.js";
import { appointmentsRouter } from "./modules/appointments/appointments.routes.js";
import { paymentsRouter, stripeWebhookRouter } from "./modules/payments/payments.routes.js";
import { reviewsRouter } from "./modules/reviews/reviews.routes.js";
import { prescriptionsRouter } from "./modules/prescriptions/prescriptions.routes.js";
import { favoritesRouter } from "./modules/favorites/favorites.routes.js";
import { contactRouter } from "./modules/contact/contact.routes.js";
import { analyticsRouter } from "./modules/analytics/analytics.routes.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import { remindersRouter } from "./modules/reminders/reminders.routes.js";
import { isDatabaseHealthy } from "./config/database.js";
import { asyncHandler } from "./utils/async-handler.js";

export const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: env.CLIENT_URL, credentials: true, methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] }));
app.use(pinoHttp({ logger }));

const generalLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 500, standardHeaders: "draft-8", legacyHeaders: false });
const sensitiveLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false });
app.use(generalLimiter);

// Both handlers must run before JSON parsing: Better Auth owns its body and Stripe verifies raw bytes.
app.all("/api/auth/*splat", toNodeHandler(auth));
app.use("/api/webhooks/stripe", stripeWebhookRouter);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

app.get("/api/health", asyncHandler(async (_request, response) => {
  const healthy = await isDatabaseHealthy();
  response.status(healthy ? 200 : 503).json({ success: healthy, data: { status: healthy ? "healthy" : "unhealthy", database: healthy ? "connected" : "disconnected", timestamp: new Date().toISOString() } });
}));
app.use("/api/users", usersRouter);
app.use("/api/doctors", doctorsRouter);
app.use("/api/schedules", schedulesRouter);
app.use("/api/appointments", sensitiveLimiter, appointmentsRouter);
app.use("/api/payments", sensitiveLimiter, paymentsRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/prescriptions", prescriptionsRouter);
app.use("/api/favorites", favoritesRouter);
app.use("/api/contact", sensitiveLimiter, contactRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/admin", sensitiveLimiter, adminRouter);
app.use("/api/cron", sensitiveLimiter, remindersRouter);
app.use(notFoundHandler);
app.use(errorHandler);

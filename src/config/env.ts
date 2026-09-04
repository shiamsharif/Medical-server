import "dotenv/config";
import { z } from "zod";
import { AppError } from "../errors/app-error.js";

const optionalIntegration = z.string().trim().min(1).optional();
const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(5000),
    CLIENT_URL: z.url(),
    SERVER_URL: z.url(),
    MONGODB_URI: z.string().min(1),
    MONGODB_DATABASE: z.string().min(1).default("medicare_connect"),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    GOOGLE_CLIENT_ID: optionalIntegration,
    GOOGLE_CLIENT_SECRET: optionalIntegration,
    STRIPE_SECRET_KEY: optionalIntegration,
    STRIPE_WEBHOOK_SECRET: optionalIntegration,
    EMAIL_FROM: optionalIntegration,
    RESEND_API_KEY: optionalIntegration,
    ADMIN_NAME: optionalIntegration,
    ADMIN_EMAIL: z.email().optional(),
    ADMIN_PASSWORD: z.string().min(12).optional(),
    CRON_SECRET: optionalIntegration,
  })
  .superRefine((value, context) => {
    if (Boolean(value.GOOGLE_CLIENT_ID) !== Boolean(value.GOOGLE_CLIENT_SECRET)) {
      context.addIssue({
        code: "custom",
        path: [value.GOOGLE_CLIENT_ID ? "GOOGLE_CLIENT_SECRET" : "GOOGLE_CLIENT_ID"],
        message: "Google OAuth requires both the client ID and client secret",
      });
    }
  });

const result = schema.safeParse(process.env);
if (!result.success) {
  const names = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Invalid environment configuration. Check: ${names}`);
}

export const env = result.data;

export function requireIntegration(name: keyof typeof env): string {
  const value = env[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new AppError(
      503,
      `${name} is not configured on the server`,
      "INTEGRATION_NOT_CONFIGURED",
    );
  }
  return value;
}

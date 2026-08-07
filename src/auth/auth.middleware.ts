import type { NextFunction, Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AppUser } from "../types/documents.js";
import type { UserRole } from "../constants/domain.js";
import { USER_STATUS } from "../constants/domain.js";
import { env } from "../config/env.js";
import { getDatabase } from "../config/database.js";
import { forbidden, unauthorized } from "../errors/app-error.js";
import { auth } from "./auth.js";

const jwks = createRemoteJWKSet(new URL("/api/auth/jwks", env.BETTER_AUTH_URL));

async function resolveAuthUserId(request: Request): Promise<string | undefined> {
  const authorization = request.header("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;

  if (token?.split(".").length === 3) {
    // JWTs are cryptographically verified against Better Auth's rotating JWKS; decoding alone is never trusted.
    const verified = await jwtVerify(token, jwks, {
      issuer: env.BETTER_AUTH_URL,
      audience: env.BETTER_AUTH_URL,
    });
    return verified.payload.sub;
  }

  const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
  return session?.user.id;
}

export async function authenticate(request: Request, _response: Response, next: NextFunction): Promise<void> {
  try {
    const authUserId = await resolveAuthUserId(request);
    if (!authUserId) throw unauthorized();
    const user = await getDatabase().collection<AppUser>("app_users").findOne({ authUserId });
    if (!user?._id) throw unauthorized("Complete account onboarding before accessing private APIs");
    request.principal = {
      authUserId,
      appUserId: user._id,
      email: user.email,
      role: user.role,
      status: user.status,
    };
    next();
  } catch (error) {
    next(error instanceof Error && error.name === "AppError" ? error : unauthorized("Invalid or expired authentication"));
  }
}

export function requireRole(...roles: UserRole[]) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    if (!request.principal || !roles.includes(request.principal.role)) return next(forbidden());
    next();
  };
}

export function requireActiveUser(request: Request, _response: Response, next: NextFunction): void {
  if (request.principal?.status !== USER_STATUS.ACTIVE) return next(forbidden("This account is suspended"));
  next();
}

import type { NextFunction, Request, Response } from "express";
import type { Doctor } from "../types/documents.js";
import { VERIFICATION_STATUS } from "../constants/domain.js";
import { getDatabase } from "../config/database.js";
import { forbidden } from "../errors/app-error.js";

export async function requireVerifiedDoctor(request: Request, _response: Response, next: NextFunction): Promise<void> {
  try {
    if (!request.principal) return next(forbidden());
    const doctor = await getDatabase().collection<Doctor>("doctors").findOne({
      userId: request.principal.appUserId,
      verificationStatus: VERIFICATION_STATUS.VERIFIED,
    });
    if (!doctor) return next(forbidden("A verified doctor profile is required"));
    next();
  } catch (error) {
    next(error);
  }
}

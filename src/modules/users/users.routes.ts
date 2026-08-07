import { Router } from "express";
import { z } from "zod";
import { getDatabase } from "../../config/database.js";
import { USER_ROLE, USER_STATUS } from "../../constants/domain.js";
import type { AppUser, Doctor } from "../../types/documents.js";
import { authenticate, requireActiveUser } from "../../auth/auth.middleware.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { success } from "../../utils/response.js";
import { validateBody } from "../../middleware/validate.js";
import { conflict } from "../../errors/app-error.js";
import { VERIFICATION_STATUS } from "../../constants/domain.js";

const onboardingSchema = z.object({
  role: z.enum([USER_ROLE.PATIENT, USER_ROLE.DOCTOR]),
  name: z.string().trim().min(2).max(100),
  email: z.email(),
});
const profileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  image: z.url().optional(),
  phone: z.string().trim().min(7).max(30).optional(),
  gender: z.string().trim().min(1).max(30).optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one profile field is required");

export const usersRouter = Router();

usersRouter.post("/onboarding", validateBody(onboardingSchema), asyncHandler(async (request, response) => {
  const { auth } = await import("../../auth/auth.js");
  const { fromNodeHeaders } = await import("better-auth/node");
  const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
  if (!session) throw new (await import("../../errors/app-error.js")).AppError(401, "Authentication required", "UNAUTHORIZED");
  if (session.user.email.toLowerCase() !== request.body.email.toLowerCase()) throw conflict("Email must match the authenticated account", "IDENTITY_MISMATCH");
  const now = new Date();
  const user: AppUser = {
    authUserId: session.user.id,
    name: request.body.name,
    email: session.user.email.toLowerCase(),
    role: request.body.role,
    status: USER_STATUS.ACTIVE,
    createdAt: now,
    updatedAt: now,
  };
  const result = await getDatabase().collection<AppUser>("app_users").insertOne(user);
  if (user.role === USER_ROLE.DOCTOR) {
    const doctor: Doctor = {
      userId: result.insertedId,
      doctorName: user.name,
      specialization: "Not specified",
      qualifications: [],
      experience: 0,
      consultationFee: 0,
      hospitalName: "Not specified",
      availableDays: [],
      verificationStatus: VERIFICATION_STATUS.PENDING,
      averageRating: 0,
      reviewCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await getDatabase().collection<Doctor>("doctors").insertOne(doctor);
  }
  success(response, { id: result.insertedId, ...user }, "Account onboarding completed", 201);
}));

usersRouter.get("/me", authenticate, requireActiveUser, asyncHandler(async (request, response) => {
  const user = await getDatabase().collection<AppUser>("app_users").findOne({ _id: request.principal!.appUserId });
  success(response, user);
}));

usersRouter.patch("/me", authenticate, requireActiveUser, validateBody(profileSchema), asyncHandler(async (request, response) => {
  const updatedAt = new Date();
  await getDatabase().collection<AppUser>("app_users").updateOne(
    { _id: request.principal!.appUserId },
    { $set: { ...request.body, updatedAt } },
  );
  success(response, { ...request.body, updatedAt }, "Profile updated");
}));

import { Router } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { z } from "zod";
import { auth } from "../../auth/auth.js";
import { getDatabase } from "../../config/database.js";
import { USER_ROLE, USER_STATUS, VERIFICATION_STATUS } from "../../constants/domain.js";
import type { AppUser, Doctor } from "../../types/documents.js";
import { authenticate, requireActiveUser } from "../../auth/auth.middleware.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { success } from "../../utils/response.js";
import { validateBody } from "../../middleware/validate.js";
import { conflict, unauthorized } from "../../errors/app-error.js";

const remoteImageSchema = z.string().max(2048).refine((value) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, "Image must be a valid HTTP URL");
const uploadedImageSchema = z
  .string()
  .max(900_000)
  .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/, "Invalid uploaded image");
const profileImageSchema = z.union([remoteImageSchema, uploadedImageSchema]);
const bloodGroupSchema = z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]);

const onboardingSchema = z.object({
  role: z.enum([USER_ROLE.PATIENT, USER_ROLE.DOCTOR]),
  name: z.string().trim().min(2).max(100),
  email: z.email(),
  image: remoteImageSchema.optional(),
});
const profileSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    image: profileImageSchema.optional(),
    phone: z.string().trim().min(7).max(30).optional(),
    gender: z.string().trim().min(1).max(30).optional(),
    location: z.string().trim().min(2).max(200).optional(),
    bloodGroup: bloodGroupSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one profile field is required");
const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(128).optional(),
  newPassword: z
    .string()
    .min(8)
    .max(128)
    .regex(/\d/, "Password must include a number")
    .regex(/[^A-Za-z0-9]/, "Password must include a special character"),
});

export const usersRouter = Router();

usersRouter.post(
  "/onboarding",
  validateBody(onboardingSchema),
  asyncHandler(async (request, response) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) {
      throw unauthorized();
    }
    if (session.user.email.toLowerCase() !== request.body.email.toLowerCase()) {
      throw conflict("Email must match the authenticated account", "IDENTITY_MISMATCH");
    }
    const collection = getDatabase().collection<AppUser>("app_users");
    const existing = await collection.findOne({ authUserId: session.user.id });
    if (existing) {
      success(response, existing, "Account onboarding already completed");
      return;
    }

    const emailOwner = await collection.findOne({ email: session.user.email.toLowerCase() });
    if (emailOwner) {
      throw conflict("This email is already linked to another account", "EMAIL_ALREADY_LINKED");
    }

    const now = new Date();
    const user: AppUser = {
      authUserId: session.user.id,
      name: request.body.name.trim(),
      email: session.user.email.toLowerCase(),
      ...(request.body.image ? { image: request.body.image } : {}),
      role: request.body.role,
      status: USER_STATUS.ACTIVE,
      createdAt: now,
      updatedAt: now,
    };
    const result = await collection.insertOne(user);
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
  }),
);

usersRouter.get(
  "/me",
  authenticate,
  requireActiveUser,
  asyncHandler(async (request, response) => {
    let user = await getDatabase()
      .collection<AppUser>("app_users")
      .findOne({ _id: request.principal!.appUserId });
    if (user && !user.image) {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
      if (session?.user.image && remoteImageSchema.safeParse(session.user.image).success) {
        await getDatabase()
          .collection<AppUser>("app_users")
          .updateOne(
            { _id: request.principal!.appUserId, image: { $exists: false } },
            { $set: { image: session.user.image, updatedAt: new Date() } },
          );
        user = { ...user, image: session.user.image };
      }
    }
    success(response, user);
  }),
);

usersRouter.patch(
  "/me",
  authenticate,
  requireActiveUser,
  validateBody(profileSchema),
  asyncHandler(async (request, response) => {
    const updatedAt = new Date();
    const user = await getDatabase()
      .collection<AppUser>("app_users")
      .findOneAndUpdate(
        { _id: request.principal!.appUserId },
        { $set: { ...request.body, updatedAt } },
        { returnDocument: "after" },
      );
    success(response, user, "Profile updated");
  }),
);

usersRouter.post(
  "/password",
  authenticate,
  requireActiveUser,
  validateBody(passwordSchema),
  asyncHandler(async (request, response) => {
    const headers = fromNodeHeaders(request.headers);
    if (request.body.currentPassword) {
      await auth.api.changePassword({
        headers,
        body: {
          currentPassword: request.body.currentPassword,
          newPassword: request.body.newPassword,
          revokeOtherSessions: false,
        },
      });
      success(response, null, "Password changed");
      return;
    }
    await auth.api.setPassword({ headers, body: { newPassword: request.body.newPassword } });
    success(response, null, "Password added to your account");
  }),
);

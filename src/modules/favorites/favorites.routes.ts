import { Router } from "express";
import { MongoServerError } from "mongodb";
import type { ObjectId } from "mongodb";
import { authenticate, requireActiveUser, requireRole } from "../../auth/auth.middleware.js";
import { getDatabase } from "../../config/database.js";
import { USER_ROLE, VERIFICATION_STATUS } from "../../constants/domain.js";
import type { Doctor } from "../../types/documents.js";
import { conflict, notFound } from "../../errors/app-error.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { success } from "../../utils/response.js";
import { toObjectId } from "../../utils/validation.js";

interface Favorite {
  patientId: ObjectId;
  doctorId: ObjectId;
  createdAt: Date;
}
export const favoritesRouter = Router();
const patientOnly = [authenticate, requireActiveUser, requireRole(USER_ROLE.PATIENT)] as const;

favoritesRouter.get(
  "/",
  ...patientOnly,
  asyncHandler(async (request, response) => {
    const data = await getDatabase()
      .collection<Favorite>("favorites")
      .aggregate([
        { $match: { patientId: request.principal!.appUserId } },
        { $lookup: { from: "doctors", localField: "doctorId", foreignField: "_id", as: "doctor" } },
        { $unwind: "$doctor" },
        { $project: { patientId: 0, "doctor.userId": 0 } },
      ])
      .toArray();
    success(response, data);
  }),
);

favoritesRouter.post(
  "/:doctorId",
  ...patientOnly,
  asyncHandler(async (request, response) => {
    const doctorId = toObjectId(request.params.doctorId ?? "");
    const exists = await getDatabase()
      .collection<Doctor>("doctors")
      .findOne({ _id: doctorId, verificationStatus: VERIFICATION_STATUS.VERIFIED });
    if (!exists) {
      throw notFound("Verified doctor");
    }
    try {
      await getDatabase()
        .collection<Favorite>("favorites")
        .insertOne({ patientId: request.principal!.appUserId, doctorId, createdAt: new Date() });
      success(response, null, "Doctor added to favorites", 201);
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        throw conflict("Doctor is already a favorite", "DUPLICATE_FAVORITE");
      }
      throw error;
    }
  }),
);

favoritesRouter.delete(
  "/:doctorId",
  ...patientOnly,
  asyncHandler(async (request, response) => {
    const result = await getDatabase()
      .collection<Favorite>("favorites")
      .deleteOne({
        patientId: request.principal!.appUserId,
        doctorId: toObjectId(request.params.doctorId ?? ""),
      });
    if (!result.deletedCount) {
      throw notFound("Favorite");
    }
    response.status(204).end();
  }),
);

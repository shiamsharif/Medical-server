import { Router } from "express";
import { z } from "zod";
import type { Filter, Sort } from "mongodb";
import { authenticate, requireActiveUser, requireRole } from "../../auth/auth.middleware.js";
import { getDatabase } from "../../config/database.js";
import { USER_ROLE, VERIFICATION_STATUS } from "../../constants/domain.js";
import type { Doctor, Review, Schedule } from "../../types/documents.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  paginationMeta,
  paginationOffset,
  paginationSchema,
  toObjectId,
} from "../../utils/validation.js";
import { success } from "../../utils/response.js";
import { validateBody } from "../../middleware/validate.js";
import { notFound } from "../../errors/app-error.js";
import { currentIsoDate, weekdayForIsoDate } from "../../utils/date-time.js";

const searchSchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  specialization: z.string().trim().max(100).optional(),
  hospital: z.string().trim().max(150).optional(),
  availability: z.enum(["today", "week"]).optional(),
  minFee: z.coerce.number().min(0).optional(),
  maxFee: z.coerce.number().min(0).optional(),
  sort: z.enum(["fee_asc", "fee_desc", "experience_desc", "rating_desc"]).default("rating_desc"),
}).refine((value) => value.minFee === undefined || value.maxFee === undefined || value.minFee <= value.maxFee, {
  message: "minFee must not exceed maxFee",
});
const updateSchema = z
  .object({
    doctorName: z.string().trim().min(2).max(100).optional(),
    specialization: z.string().trim().min(2).max(100).optional(),
    qualifications: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
    experience: z.number().int().min(0).max(80).optional(),
    consultationFee: z.number().min(0).max(1_000_000).optional(),
    hospitalName: z.string().trim().min(2).max(150).optional(),
    profileImage: z.url().optional(),
    biography: z.string().trim().max(3000).optional(),
    availableDays: z
      .array(z.enum(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]))
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

const sortMap: Record<z.infer<typeof searchSchema>["sort"], Sort> = {
  fee_asc: { consultationFee: 1 },
  fee_desc: { consultationFee: -1 },
  experience_desc: { experience: -1 },
  rating_desc: { averageRating: -1 },
};

export const doctorsRouter = Router();

doctorsRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const query = searchSchema.parse(request.query);
    const filter: Filter<Doctor> = { verificationStatus: VERIFICATION_STATUS.VERIFIED };
    if (query.search) {
      filter.$text = { $search: query.search };
    }
    if (query.specialization) {
      filter.specialization = {
        $regex: query.specialization.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        $options: "i",
      };
    }
    if (query.hospital) {
      filter.hospitalName = {
        $regex: query.hospital.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        $options: "i",
      };
    }
    if (query.minFee !== undefined || query.maxFee !== undefined) {
      filter.consultationFee = {
        ...(query.minFee !== undefined ? { $gte: query.minFee } : {}),
        ...(query.maxFee !== undefined ? { $lte: query.maxFee } : {}),
      };
    }
    if (query.availability) {
      const scheduleFilter: Filter<Schedule> = { active: true };
      if (query.availability === "today") {
        const today = currentIsoDate();
        scheduleFilter.day = { $in: [today, weekdayForIsoDate(today)] };
      }
      filter._id = {
        $in: await getDatabase()
          .collection<Schedule>("schedules")
          .distinct("doctorId", scheduleFilter),
      };
    }
    const collection = getDatabase().collection<Doctor>("doctors");
    const [data, total] = await Promise.all([
      collection
        .find(filter)
        .sort(sortMap[query.sort])
        .skip(paginationOffset(query.page, query.limit))
        .limit(query.limit)
        .toArray(),
      collection.countDocuments(filter),
    ]);
    response.json({ success: true, data, meta: paginationMeta(query.page, query.limit, total) });
  }),
);

doctorsRouter.get(
  "/me/profile",
  authenticate,
  requireActiveUser,
  requireRole(USER_ROLE.DOCTOR),
  asyncHandler(async (request, response) => {
    const doctor = await getDatabase()
      .collection<Doctor>("doctors")
      .findOne({ userId: request.principal!.appUserId });
    if (!doctor) {
      throw notFound("Doctor profile");
    }
    success(response, doctor);
  }),
);

doctorsRouter.patch(
  "/me/profile",
  authenticate,
  requireActiveUser,
  requireRole(USER_ROLE.DOCTOR),
  validateBody(updateSchema),
  asyncHandler(async (request, response) => {
    const result = await getDatabase()
      .collection<Doctor>("doctors")
      .findOneAndUpdate(
        { userId: request.principal!.appUserId },
        { $set: { ...request.body, updatedAt: new Date() } },
        { returnDocument: "after" },
      );
    if (!result) {
      throw notFound("Doctor profile");
    }
    success(response, result, "Doctor profile updated");
  }),
);

doctorsRouter.get(
  "/:id",
  asyncHandler(async (request, response) => {
    const doctorId = toObjectId(request.params.id ?? "");
    const doctor = await getDatabase()
      .collection<Doctor>("doctors")
      .findOne(
        { _id: doctorId, verificationStatus: VERIFICATION_STATUS.VERIFIED },
        { projection: { userId: 0 } },
      );
    if (!doctor) {
      throw notFound("Doctor");
    }
    const [reviews, schedules] = await Promise.all([
      getDatabase()
        .collection<Review>("reviews")
        .find({ doctorId })
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray(),
      getDatabase()
        .collection<Schedule>("schedules")
        .find({ doctorId, active: true })
        .project({ doctorId: 0, createdAt: 0, updatedAt: 0 })
        .sort({ day: 1, startTime: 1 })
        .toArray(),
    ]);
    success(response, { ...doctor, availability: schedules, reviews });
  }),
);

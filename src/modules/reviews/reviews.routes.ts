import { Router } from "express";
import { MongoServerError } from "mongodb";
import { z } from "zod";
import { authenticate, requireActiveUser, requireRole } from "../../auth/auth.middleware.js";
import { getDatabase } from "../../config/database.js";
import { APPOINTMENT_STATUS, USER_ROLE } from "../../constants/domain.js";
import type { Appointment, Doctor, Review } from "../../types/documents.js";
import { conflict, notFound } from "../../errors/app-error.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { success } from "../../utils/response.js";
import { toObjectId } from "../../utils/validation.js";

const createSchema = z.object({ appointmentId: z.string(), rating: z.number().int().min(1).max(5), reviewText: z.string().trim().min(3).max(2000) });
const updateSchema = createSchema.pick({ rating: true, reviewText: true }).partial().refine((value) => Object.keys(value).length > 0);

async function recalculateRating(doctorId: NonNullable<Review["doctorId"]>): Promise<void> {
  const [rating] = await getDatabase().collection<Review>("reviews").aggregate<{ averageRating: number; reviewCount: number }>([
    { $match: { doctorId } }, { $group: { _id: null, averageRating: { $avg: "$rating" }, reviewCount: { $sum: 1 } } },
  ]).toArray();
  await getDatabase().collection<Doctor>("doctors").updateOne({ _id: doctorId }, { $set: {
    averageRating: rating ? Math.round(rating.averageRating * 10) / 10 : 0,
    reviewCount: rating?.reviewCount ?? 0, updatedAt: new Date(),
  } });
}

export const reviewsRouter = Router();
const patientOnly = [authenticate, requireActiveUser, requireRole(USER_ROLE.PATIENT)] as const;

reviewsRouter.get("/mine", ...patientOnly, asyncHandler(async (request, response) => {
  const data = await getDatabase().collection<Review>("reviews").find({ patientId: request.principal!.appUserId }).sort({ createdAt: -1 }).toArray();
  success(response, data);
}));

reviewsRouter.post("/", ...patientOnly, validateBody(createSchema), asyncHandler(async (request, response) => {
  const appointment = await getDatabase().collection<Appointment>("appointments").findOne({
    _id: toObjectId(request.body.appointmentId), patientId: request.principal!.appUserId,
    appointmentStatus: APPOINTMENT_STATUS.COMPLETED,
  });
  if (!appointment?._id) throw conflict("Only your completed appointment can be reviewed", "REVIEW_NOT_ELIGIBLE");
  const now = new Date();
  const review: Review = {
    patientId: appointment.patientId, doctorId: appointment.doctorId, appointmentId: appointment._id,
    rating: request.body.rating, reviewText: request.body.reviewText, createdAt: now, updatedAt: now,
  };
  try {
    const result = await getDatabase().collection<Review>("reviews").insertOne(review);
    await recalculateRating(appointment.doctorId);
    success(response, { ...review, _id: result.insertedId }, "Review created", 201);
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) throw conflict("This appointment has already been reviewed", "DUPLICATE_REVIEW");
    throw error;
  }
}));

reviewsRouter.patch("/:id", ...patientOnly, validateBody(updateSchema), asyncHandler(async (request, response) => {
  const result = await getDatabase().collection<Review>("reviews").findOneAndUpdate(
    { _id: toObjectId(request.params.id ?? ""), patientId: request.principal!.appUserId },
    { $set: { ...request.body, updatedAt: new Date() } }, { returnDocument: "after" },
  );
  if (!result) throw notFound("Review");
  await recalculateRating(result.doctorId);
  success(response, result, "Review updated");
}));

reviewsRouter.delete("/:id", ...patientOnly, asyncHandler(async (request, response) => {
  const review = await getDatabase().collection<Review>("reviews").findOneAndDelete({ _id: toObjectId(request.params.id ?? ""), patientId: request.principal!.appUserId });
  if (!review) throw notFound("Review");
  await recalculateRating(review.doctorId);
  response.status(204).end();
}));

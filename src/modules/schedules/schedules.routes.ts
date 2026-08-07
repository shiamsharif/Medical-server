import { Router } from "express";
import type { WithId } from "mongodb";
import { z } from "zod";
import { authenticate, requireActiveUser, requireRole } from "../../auth/auth.middleware.js";
import { getDatabase } from "../../config/database.js";
import { APPOINTMENT_STATUS, USER_ROLE, VERIFICATION_STATUS } from "../../constants/domain.js";
import type { Appointment, Doctor, Schedule } from "../../types/documents.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { dateSchema, timeSchema, toObjectId } from "../../utils/validation.js";
import { badRequest, conflict, notFound } from "../../errors/app-error.js";
import { success } from "../../utils/response.js";
import {
  currentIsoDate,
  minutesToTime,
  timeToMinutes,
  weekdayForIsoDate,
} from "../../utils/date-time.js";

const scheduleFields = {
  day: z.string().trim().min(1).max(20),
  startTime: timeSchema,
  endTime: timeSchema,
  slotDuration: z.number().int().min(10).max(240),
  active: z.boolean(),
};

const scheduleSchema = z
  .object({
    ...scheduleFields,
    active: z.boolean().default(true),
  })
  .refine((value) => value.startTime < value.endTime, {
    message: "startTime must be before endTime",
  });

const updateScheduleSchema = z
  .object(scheduleFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

async function ownDoctor(
  userId: NonNullable<Express.Request["principal"]>["appUserId"],
): Promise<WithId<Doctor>> {
  const doctor = await getDatabase().collection<Doctor>("doctors").findOne({ userId });
  if (!doctor?._id) {
    throw notFound("Doctor profile");
  }
  return doctor as WithId<Doctor>;
}

export const schedulesRouter = Router();
const doctorOnly = [authenticate, requireActiveUser, requireRole(USER_ROLE.DOCTOR)] as const;

schedulesRouter.get(
  "/me",
  ...doctorOnly,
  asyncHandler(async (request, response) => {
    const doctor = await ownDoctor(request.principal!.appUserId);
    success(
      response,
      await getDatabase()
        .collection<Schedule>("schedules")
        .find({ doctorId: doctor._id })
        .sort({ day: 1, startTime: 1 })
        .toArray(),
    );
  }),
);

schedulesRouter.post(
  "/",
  ...doctorOnly,
  validateBody(scheduleSchema),
  asyncHandler(async (request, response) => {
    const doctor = await ownDoctor(request.principal!.appUserId);
    const overlap = await getDatabase()
      .collection<Schedule>("schedules")
      .findOne({
        doctorId: doctor._id,
        day: request.body.day,
        startTime: { $lt: request.body.endTime },
        endTime: { $gt: request.body.startTime },
      });
    if (overlap) {
      throw conflict("Schedule overlaps an existing schedule", "SCHEDULE_OVERLAP");
    }
    const now = new Date();
    const schedule: Schedule = {
      doctorId: doctor._id!,
      ...request.body,
      createdAt: now,
      updatedAt: now,
    };
    const result = await getDatabase().collection<Schedule>("schedules").insertOne(schedule);
    success(response, { ...schedule, _id: result.insertedId }, "Schedule created", 201);
  }),
);

schedulesRouter.patch(
  "/:id",
  ...doctorOnly,
  validateBody(updateScheduleSchema),
  asyncHandler(async (request, response) => {
    const doctor = await ownDoctor(request.principal!.appUserId);
    const id = toObjectId(request.params.id ?? "");
    const current = await getDatabase()
      .collection<Schedule>("schedules")
      .findOne({ _id: id, doctorId: doctor._id });
    if (!current) {
      throw notFound("Schedule");
    }
    const next = { ...current, ...request.body };
    if (next.startTime >= next.endTime) {
      throw badRequest("startTime must be before endTime");
    }
    const overlap = await getDatabase()
      .collection<Schedule>("schedules")
      .findOne({
        _id: { $ne: id },
        doctorId: doctor._id,
        day: next.day,
        startTime: { $lt: next.endTime },
        endTime: { $gt: next.startTime },
      });
    if (overlap) {
      throw conflict("Schedule overlaps an existing schedule", "SCHEDULE_OVERLAP");
    }
    const result = await getDatabase()
      .collection<Schedule>("schedules")
      .findOneAndUpdate(
        { _id: id },
        { $set: { ...request.body, updatedAt: new Date() } },
        { returnDocument: "after" },
      );
    success(response, result, "Schedule updated");
  }),
);

schedulesRouter.delete(
  "/:id",
  ...doctorOnly,
  asyncHandler(async (request, response) => {
    const doctor = await ownDoctor(request.principal!.appUserId);
    const result = await getDatabase()
      .collection<Schedule>("schedules")
      .deleteOne({ _id: toObjectId(request.params.id ?? ""), doctorId: doctor._id });
    if (!result.deletedCount) {
      throw notFound("Schedule");
    }
    response.status(204).end();
  }),
);

schedulesRouter.get(
  "/doctor/:doctorId/availability",
  asyncHandler(async (request, response) => {
    const doctorId = toObjectId(request.params.doctorId ?? "");
    const { date } = z.object({ date: dateSchema }).parse(request.query);
    if (date < currentIsoDate()) {
      throw badRequest("Date cannot be in the past");
    }
    const doctor = await getDatabase()
      .collection<Doctor>("doctors")
      .findOne({ _id: doctorId, verificationStatus: VERIFICATION_STATUS.VERIFIED });
    if (!doctor) {
      throw notFound("Verified doctor");
    }
    const day = weekdayForIsoDate(date);
    const schedules = await getDatabase()
      .collection<Schedule>("schedules")
      .find({ doctorId, active: true, day: { $in: [day, date] } })
      .toArray();
    const appointments = await getDatabase()
      .collection<Appointment>("appointments")
      .find({
        doctorId,
        appointmentDate: date,
        appointmentStatus: {
          $in: [
            APPOINTMENT_STATUS.PAYMENT_PENDING,
            APPOINTMENT_STATUS.PENDING,
            APPOINTMENT_STATUS.ACCEPTED,
          ],
        },
      })
      .project({ appointmentTime: 1 })
      .toArray();
    const booked = new Set(appointments.map((item) => item.appointmentTime));
    const slots = schedules
      .flatMap((schedule) => {
        const values: string[] = [];
        for (
          let cursor = timeToMinutes(schedule.startTime);
          cursor + schedule.slotDuration <= timeToMinutes(schedule.endTime);
          cursor += schedule.slotDuration
        ) {
          values.push(minutesToTime(cursor));
        }
        return values;
      })
      .filter((slot) => !booked.has(slot));
    success(response, { date, slots: [...new Set(slots)].sort() });
  }),
);

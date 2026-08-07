import { Router } from "express";
import { MongoServerError, type Filter, type ObjectId, type WithId } from "mongodb";
import { z } from "zod";
import Stripe from "stripe";
import { authenticate, requireActiveUser, requireRole } from "../../auth/auth.middleware.js";
import { requireVerifiedDoctor } from "../../auth/doctor.middleware.js";
import { getDatabase } from "../../config/database.js";
import { requireIntegration } from "../../config/env.js";
import {
  APPOINTMENT_STATUS,
  PAYMENT_STATUS,
  USER_ROLE,
  VERIFICATION_STATUS,
  type AppointmentStatus,
} from "../../constants/domain.js";
import type { Appointment, Doctor, Payment, Schedule } from "../../types/documents.js";
import { badRequest, conflict, notFound } from "../../errors/app-error.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  dateSchema,
  paginationMeta,
  paginationOffset,
  paginationSchema,
  timeSchema,
  toObjectId,
} from "../../utils/validation.js";
import { success } from "../../utils/response.js";
import { validateBody } from "../../middleware/validate.js";
import { assertAppointmentTransition, consultationFeeInMinorUnits } from "./appointment.service.js";
import { currentIsoDate, timeToMinutes, weekdayForIsoDate } from "../../utils/date-time.js";

const bookingSchema = z.object({
  doctorId: z.string(),
  appointmentDate: dateSchema,
  appointmentTime: timeSchema,
  symptoms: z.string().trim().min(3).max(2000),
});
const rescheduleSchema = z.object({ appointmentDate: dateSchema, appointmentTime: timeSchema });

async function verifyScheduledSlot(doctorId: ObjectId, date: string, time: string): Promise<void> {
  if (date < currentIsoDate()) {
    throw badRequest("Appointment date cannot be in the past");
  }
  const candidates = await getDatabase()
    .collection<Schedule>("schedules")
    .find({
      doctorId,
      active: true,
      day: { $in: [date, weekdayForIsoDate(date)] },
      startTime: { $lte: time },
      endTime: { $gt: time },
    })
    .toArray();
  const appointmentTime = timeToMinutes(time);
  const valid = candidates.some(
    (schedule) =>
      (appointmentTime - timeToMinutes(schedule.startTime)) % schedule.slotDuration === 0 &&
      appointmentTime + schedule.slotDuration <= timeToMinutes(schedule.endTime),
  );
  if (!valid) {
    throw conflict(
      "The selected time is not an available schedule slot",
      "APPOINTMENT_SLOT_UNAVAILABLE",
    );
  }
}

async function doctorForPrincipal(appUserId: ObjectId): Promise<WithId<Doctor>> {
  const doctor = await getDatabase().collection<Doctor>("doctors").findOne({ userId: appUserId });
  if (!doctor?._id) {
    throw notFound("Doctor profile");
  }
  return doctor as WithId<Doctor>;
}

async function patientAppointment(
  id: string | string[],
  patientId: ObjectId,
): Promise<WithId<Appointment>> {
  const appointment = await getDatabase()
    .collection<Appointment>("appointments")
    .findOne({ _id: toObjectId(id), patientId });
  if (!appointment?._id) {
    throw notFound("Appointment");
  }
  return appointment as WithId<Appointment>;
}

export const appointmentsRouter = Router();
const patientOnly = [authenticate, requireActiveUser, requireRole(USER_ROLE.PATIENT)] as const;
const doctorOnly = [
  authenticate,
  requireActiveUser,
  requireRole(USER_ROLE.DOCTOR),
  requireVerifiedDoctor,
] as const;

appointmentsRouter.post(
  "/",
  ...patientOnly,
  validateBody(bookingSchema),
  asyncHandler(async (request, response) => {
    const doctorId = toObjectId(request.body.doctorId);
    const doctor = await getDatabase()
      .collection<Doctor>("doctors")
      .findOne({ _id: doctorId, verificationStatus: VERIFICATION_STATUS.VERIFIED });
    if (!doctor) {
      throw notFound("Verified doctor");
    }
    await verifyScheduledSlot(doctorId, request.body.appointmentDate, request.body.appointmentTime);
    const now = new Date();
    const appointment: Appointment = {
      patientId: request.principal!.appUserId,
      doctorId,
      appointmentDate: request.body.appointmentDate,
      appointmentTime: request.body.appointmentTime,
      symptoms: request.body.symptoms,
      appointmentStatus: APPOINTMENT_STATUS.PAYMENT_PENDING,
      paymentStatus: PAYMENT_STATUS.PENDING,
      // Historical billing must not change if the doctor edits their fee after this booking.
      consultationFeeSnapshot: doctor.consultationFee,
      createdAt: now,
      updatedAt: now,
    };
    let appointmentId: ObjectId;
    try {
      appointmentId = (
        await getDatabase().collection<Appointment>("appointments").insertOne(appointment)
      ).insertedId;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        throw conflict("This appointment slot is no longer available", "APPOINTMENT_SLOT_CONFLICT");
      }
      throw error;
    }

    try {
      const stripe = new Stripe(requireIntegration("STRIPE_SECRET_KEY"));
      // Browser-provided amounts are ignored; the persisted doctor fee is the authoritative charge source.
      const intent = await stripe.paymentIntents.create(
        {
          amount: consultationFeeInMinorUnits(doctor.consultationFee),
          currency: "usd",
          metadata: {
            appointmentId: appointmentId.toHexString(),
            patientId: request.principal!.appUserId.toHexString(),
            doctorId: doctorId.toHexString(),
          },
          automatic_payment_methods: { enabled: true },
        },
        { idempotencyKey: `appointment-${appointmentId.toHexString()}` },
      );
      const payment: Payment = {
        appointmentId,
        patientId: request.principal!.appUserId,
        doctorId,
        amount: doctor.consultationFee,
        currency: intent.currency,
        stripePaymentIntentId: intent.id,
        paymentStatus: PAYMENT_STATUS.PENDING,
        processedEventIds: [],
        createdAt: now,
        updatedAt: now,
      };
      const paymentId = (await getDatabase().collection<Payment>("payments").insertOne(payment))
        .insertedId;
      await getDatabase()
        .collection<Appointment>("appointments")
        .updateOne({ _id: appointmentId }, { $set: { paymentId } });
      success(
        response,
        { appointmentId, paymentId, clientSecret: intent.client_secret },
        "Appointment reserved; complete payment",
        201,
      );
    } catch (error) {
      // Release the unique slot reservation when payment initialization cannot be created.
      await getDatabase()
        .collection<Appointment>("appointments")
        .updateOne(
          { _id: appointmentId },
          {
            $set: {
              appointmentStatus: APPOINTMENT_STATUS.CANCELLED,
              paymentStatus: PAYMENT_STATUS.FAILED,
              updatedAt: new Date(),
            },
          },
        );
      throw error;
    }
  }),
);

appointmentsRouter.get(
  "/mine",
  ...patientOnly,
  asyncHandler(async (request, response) => {
    const query = paginationSchema.parse(request.query);
    const filter = { patientId: request.principal!.appUserId };
    const collection = getDatabase().collection<Appointment>("appointments");
    const [data, total] = await Promise.all([
      collection
        .find(filter)
        .sort({ appointmentDate: -1, appointmentTime: -1 })
        .skip(paginationOffset(query.page, query.limit))
        .limit(query.limit)
        .toArray(),
      collection.countDocuments(filter),
    ]);
    response.json({ success: true, data, meta: paginationMeta(query.page, query.limit, total) });
  }),
);

appointmentsRouter.get(
  "/assigned",
  ...doctorOnly,
  asyncHandler(async (request, response) => {
    const doctor = await doctorForPrincipal(request.principal!.appUserId);
    const query = paginationSchema
      .extend({ status: z.nativeEnum(APPOINTMENT_STATUS).optional() })
      .parse(request.query);
    const filter: Filter<Appointment> = { doctorId: doctor._id! };
    if (query.status) {
      filter.appointmentStatus = query.status;
    }
    const collection = getDatabase().collection<Appointment>("appointments");
    const [data, total] = await Promise.all([
      collection
        .find(filter)
        .sort({ appointmentDate: 1, appointmentTime: 1 })
        .skip(paginationOffset(query.page, query.limit))
        .limit(query.limit)
        .toArray(),
      collection.countDocuments(filter),
    ]);
    response.json({ success: true, data, meta: paginationMeta(query.page, query.limit, total) });
  }),
);

appointmentsRouter.get(
  "/:id",
  authenticate,
  requireActiveUser,
  asyncHandler(async (request, response) => {
    const id = toObjectId(request.params.id ?? "");
    const filter: Filter<Appointment> = { _id: id };
    if (request.principal!.role === USER_ROLE.PATIENT) {
      filter.patientId = request.principal!.appUserId;
    } else if (request.principal!.role === USER_ROLE.DOCTOR) {
      const doctor = await doctorForPrincipal(request.principal!.appUserId);
      filter.doctorId = doctor._id!;
    } else if (request.principal!.role !== USER_ROLE.ADMIN) {
      throw notFound("Appointment");
    }
    const appointment = await getDatabase().collection<Appointment>("appointments").findOne(filter);
    if (!appointment) {
      throw notFound("Appointment");
    }
    success(response, appointment);
  }),
);

appointmentsRouter.patch(
  "/:id/reschedule",
  ...patientOnly,
  validateBody(rescheduleSchema),
  asyncHandler(async (request, response) => {
    const appointment = await patientAppointment(
      request.params.id ?? "",
      request.principal!.appUserId,
    );
    if (
      appointment.appointmentStatus !== APPOINTMENT_STATUS.PAYMENT_PENDING &&
      appointment.appointmentStatus !== APPOINTMENT_STATUS.PENDING
    ) {
      throw conflict(
        "This appointment can no longer be rescheduled",
        "INVALID_APPOINTMENT_TRANSITION",
      );
    }
    await verifyScheduledSlot(
      appointment.doctorId,
      request.body.appointmentDate,
      request.body.appointmentTime,
    );
    try {
      const result = await getDatabase()
        .collection<Appointment>("appointments")
        .findOneAndUpdate(
          { _id: appointment._id },
          { $set: { ...request.body, updatedAt: new Date() } },
          { returnDocument: "after" },
        );
      success(response, result, "Appointment rescheduled");
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        throw conflict("This appointment slot is no longer available", "APPOINTMENT_SLOT_CONFLICT");
      }
      throw error;
    }
  }),
);

appointmentsRouter.patch(
  "/:id/cancel",
  ...patientOnly,
  asyncHandler(async (request, response) => {
    const appointment = await patientAppointment(
      request.params.id ?? "",
      request.principal!.appUserId,
    );
    assertAppointmentTransition(appointment.appointmentStatus, APPOINTMENT_STATUS.CANCELLED);
    await getDatabase()
      .collection<Appointment>("appointments")
      .updateOne(
        { _id: appointment._id, appointmentStatus: appointment.appointmentStatus },
        { $set: { appointmentStatus: APPOINTMENT_STATUS.CANCELLED, updatedAt: new Date() } },
      );
    success(response, null, "Appointment cancelled");
  }),
);

for (const [path, target] of [
  ["accept", APPOINTMENT_STATUS.ACCEPTED],
  ["reject", APPOINTMENT_STATUS.REJECTED],
  ["complete", APPOINTMENT_STATUS.COMPLETED],
] as const) {
  appointmentsRouter.patch(
    `/:id/${path}`,
    ...doctorOnly,
    asyncHandler(async (request, response) => {
      const doctor = await doctorForPrincipal(request.principal!.appUserId);
      const appointment = await getDatabase()
        .collection<Appointment>("appointments")
        .findOne({ _id: toObjectId(request.params.id ?? ""), doctorId: doctor._id });
      if (!appointment) {
        throw notFound("Appointment");
      }
      assertAppointmentTransition(appointment.appointmentStatus, target as AppointmentStatus);
      const result = await getDatabase()
        .collection<Appointment>("appointments")
        .updateOne(
          { _id: appointment._id, appointmentStatus: appointment.appointmentStatus },
          { $set: { appointmentStatus: target, updatedAt: new Date() } },
        );
      if (!result.modifiedCount) {
        throw conflict(
          "Appointment state changed; refresh and try again",
          "CONCURRENT_STATE_CHANGE",
        );
      }
      success(response, null, `Appointment ${path}ed`);
    }),
  );
}

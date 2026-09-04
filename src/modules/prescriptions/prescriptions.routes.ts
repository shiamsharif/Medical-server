import { Router } from "express";
import { z } from "zod";
import { authenticate, requireActiveUser, requireRole } from "../../auth/auth.middleware.js";
import { requireVerifiedDoctor } from "../../auth/doctor.middleware.js";
import { getDatabase } from "../../config/database.js";
import { APPOINTMENT_STATUS, USER_ROLE } from "../../constants/domain.js";
import type { Appointment, Doctor, Prescription } from "../../types/documents.js";
import { conflict, notFound } from "../../errors/app-error.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { success } from "../../utils/response.js";
import { objectIdSchema, toObjectId } from "../../utils/validation.js";

const medicationSchema = z.object({
  name: z.string().trim().min(1).max(150),
  dosage: z.string().trim().min(1).max(100),
  frequency: z.string().trim().min(1).max(100),
  duration: z.string().trim().min(1).max(100),
  instructions: z.string().trim().max(500).optional(),
});
const schema = z.object({
  appointmentId: objectIdSchema,
  diagnosis: z.string().trim().min(2).max(2000),
  medications: z.array(medicationSchema).min(1).max(50),
  notes: z.string().trim().max(3000).optional(),
});

export const prescriptionsRouter = Router();

prescriptionsRouter.put(
  "/",
  authenticate,
  requireActiveUser,
  requireRole(USER_ROLE.DOCTOR),
  requireVerifiedDoctor,
  validateBody(schema),
  asyncHandler(async (request, response) => {
    const doctor = await getDatabase()
      .collection<Doctor>("doctors")
      .findOne({ userId: request.principal!.appUserId });
    if (!doctor?._id) {
      throw notFound("Doctor profile");
    }
    const appointment = await getDatabase()
      .collection<Appointment>("appointments")
      .findOne({
        _id: toObjectId(request.body.appointmentId),
        doctorId: doctor._id,
      });
    if (!appointment?._id || appointment.appointmentStatus !== APPOINTMENT_STATUS.COMPLETED) {
      throw conflict(
        "Prescription requires your completed appointment",
        "PRESCRIPTION_NOT_ALLOWED",
      );
    }
    const now = new Date();
    const result = await getDatabase()
      .collection<Prescription>("prescriptions")
      .findOneAndUpdate(
        { appointmentId: appointment._id },
        {
          $set: {
            doctorId: doctor._id,
            patientId: appointment.patientId,
            diagnosis: request.body.diagnosis,
            medications: request.body.medications,
            ...(request.body.notes ? { notes: request.body.notes } : {}),
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true, returnDocument: "after" },
      );
    success(response, result, "Prescription saved");
  }),
);

prescriptionsRouter.get(
  "/mine",
  authenticate,
  requireActiveUser,
  requireRole(USER_ROLE.PATIENT),
  asyncHandler(async (request, response) => {
    success(
      response,
      await getDatabase()
        .collection<Prescription>("prescriptions")
        .find({ patientId: request.principal!.appUserId })
        .sort({ createdAt: -1 })
        .toArray(),
    );
  }),
);

prescriptionsRouter.get(
  "/:id",
  authenticate,
  requireActiveUser,
  asyncHandler(async (request, response) => {
    const prescription = await getDatabase()
      .collection<Prescription>("prescriptions")
      .findOne({ _id: toObjectId(request.params.id ?? "") });
    if (!prescription) {
      throw notFound("Prescription");
    }
    if (
      request.principal!.role === USER_ROLE.PATIENT &&
      !prescription.patientId.equals(request.principal!.appUserId)
    ) {
      throw notFound("Prescription");
    }
    if (request.principal!.role === USER_ROLE.DOCTOR) {
      const doctor = await getDatabase()
        .collection<Doctor>("doctors")
        .findOne({ userId: request.principal!.appUserId });
      if (!doctor?._id?.equals(prescription.doctorId)) {
        throw notFound("Prescription");
      }
    }
    success(response, prescription);
  }),
);

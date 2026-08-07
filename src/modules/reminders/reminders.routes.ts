import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { Resend } from "resend";
import { getDatabase } from "../../config/database.js";
import { env, requireIntegration } from "../../config/env.js";
import { APPOINTMENT_STATUS } from "../../constants/domain.js";
import type { Appointment } from "../../types/documents.js";
import { forbidden } from "../../errors/app-error.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { success } from "../../utils/response.js";
import { logger } from "../../config/logger.js";

interface ReminderCandidate extends Appointment {
  patient: { name: string; email: string };
  doctor: { doctorName: string; hospitalName: string };
}

function validCronSecret(received: string | undefined): boolean {
  const expected = env.CRON_SECRET;
  if (!received || !expected) return false;
  const left = Buffer.from(received); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const remindersRouter = Router();
remindersRouter.post("/appointments", asyncHandler(async (request, response) => {
  if (!validCronSecret(request.header("x-cron-secret"))) throw forbidden("Invalid scheduler credential");
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const candidates = await getDatabase().collection<Appointment>("appointments").aggregate<ReminderCandidate>([
    { $match: { appointmentDate: tomorrow, appointmentStatus: APPOINTMENT_STATUS.ACCEPTED, reminderSentAt: { $exists: false } } },
    { $lookup: { from: "app_users", localField: "patientId", foreignField: "_id", as: "patient" } },
    { $lookup: { from: "doctors", localField: "doctorId", foreignField: "_id", as: "doctor" } },
    { $unwind: "$patient" }, { $unwind: "$doctor" },
  ]).toArray();
  const resend = new Resend(requireIntegration("RESEND_API_KEY"));
  let sent = 0;
  for (const appointment of candidates) {
    const claimed = await getDatabase().collection<Appointment>("appointments").updateOne(
      { _id: appointment._id!, reminderSentAt: { $exists: false } }, { $set: { reminderSentAt: new Date() } },
    );
    // Atomically claiming reminderSentAt prevents concurrent/retried schedulers from sending duplicates.
    if (!claimed.modifiedCount) continue;
    try {
      await resend.emails.send({
        from: requireIntegration("EMAIL_FROM"), to: appointment.patient.email,
        subject: "Your MediCare Connect appointment is tomorrow",
        html: `<p>Hello ${appointment.patient.name},</p><p>This is a reminder for your appointment with ${appointment.doctor.doctorName} on ${appointment.appointmentDate} at ${appointment.appointmentTime}, at ${appointment.doctor.hospitalName}.</p><p>Please arrive a few minutes early.</p>`,
      });
      sent += 1;
    } catch (error) {
      // Release the claim so a later scheduler run can retry a provider failure.
      await getDatabase().collection<Appointment>("appointments").updateOne({ _id: appointment._id! }, { $unset: { reminderSentAt: "" } });
      logger.error({ err: error, appointmentId: appointment._id }, "Reminder delivery failed");
    }
  }
  success(response, { candidates: candidates.length, sent }, "Reminder run completed");
}));

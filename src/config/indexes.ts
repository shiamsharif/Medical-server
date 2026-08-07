import type { Db } from "mongodb";
import { APPOINTMENT_STATUS } from "../constants/domain.js";

export async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all([
    db.collection("app_users").createIndexes([
      { key: { authUserId: 1 }, unique: true },
      { key: { email: 1 }, unique: true },
      { key: { role: 1, status: 1 } },
    ]),
    db.collection("doctors").createIndexes([
      { key: { userId: 1 }, unique: true },
      { key: { verificationStatus: 1, specialization: 1 } },
      { key: { doctorName: "text", specialization: "text", hospitalName: "text" } },
      { key: { consultationFee: 1 } }, { key: { experience: -1 } }, { key: { averageRating: -1 } },
    ]),
    db.collection("schedules").createIndexes([
      { key: { doctorId: 1, day: 1, startTime: 1, endTime: 1 }, unique: true },
    ]),
    db.collection("appointments").createIndexes([
      { key: { patientId: 1, appointmentDate: -1 } },
      { key: { doctorId: 1, appointmentDate: 1 } },
      // This partial unique index is the final race-safe guard when concurrent requests select one slot.
      {
        key: { doctorId: 1, appointmentDate: 1, appointmentTime: 1 },
        unique: true,
        partialFilterExpression: {
          appointmentStatus: { $in: [APPOINTMENT_STATUS.PAYMENT_PENDING, APPOINTMENT_STATUS.PENDING, APPOINTMENT_STATUS.ACCEPTED] },
        },
        name: "unique_active_doctor_slot",
      },
    ]),
    db.collection("payments").createIndex({ stripePaymentIntentId: 1 }, { unique: true }),
    db.collection("reviews").createIndexes([
      { key: { appointmentId: 1 }, unique: true }, { key: { doctorId: 1, createdAt: -1 } },
    ]),
    db.collection("prescriptions").createIndex({ appointmentId: 1 }, { unique: true }),
    db.collection("favorites").createIndex({ patientId: 1, doctorId: 1 }, { unique: true }),
    db.collection("contacts").createIndex({ createdAt: -1 }),
  ]);
}

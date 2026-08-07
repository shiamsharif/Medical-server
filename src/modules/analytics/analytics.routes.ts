import { Router } from "express";
import { authenticate, requireActiveUser, requireRole } from "../../auth/auth.middleware.js";
import { requireVerifiedDoctor } from "../../auth/doctor.middleware.js";
import { getDatabase } from "../../config/database.js";
import {
  APPOINTMENT_STATUS,
  PAYMENT_STATUS,
  USER_ROLE,
  VERIFICATION_STATUS,
} from "../../constants/domain.js";
import type { AppUser, Appointment, Doctor, Payment, Review } from "../../types/documents.js";
import { notFound } from "../../errors/app-error.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { success } from "../../utils/response.js";

export const analyticsRouter = Router();

analyticsRouter.get(
  "/public",
  asyncHandler(async (_request, response) => {
    const db = getDatabase();
    const [verifiedDoctors, patients, appointments, reviews] = await Promise.all([
      db
        .collection<Doctor>("doctors")
        .countDocuments({ verificationStatus: VERIFICATION_STATUS.VERIFIED }),
      db.collection<AppUser>("app_users").countDocuments({ role: USER_ROLE.PATIENT }),
      db.collection<Appointment>("appointments").countDocuments(),
      db.collection<Review>("reviews").countDocuments(),
    ]);
    success(response, { verifiedDoctors, patients, appointments, reviews });
  }),
);

analyticsRouter.get(
  "/patient",
  authenticate,
  requireActiveUser,
  requireRole(USER_ROLE.PATIENT),
  asyncHandler(async (request, response) => {
    const patientId = request.principal!.appUserId;
    const today = new Date().toISOString().slice(0, 10);
    const db = getDatabase();
    const [upcoming, historyCount, paid, favoriteCount] = await Promise.all([
      db
        .collection<Appointment>("appointments")
        .find({
          patientId,
          appointmentDate: { $gte: today },
          appointmentStatus: { $in: [APPOINTMENT_STATUS.PENDING, APPOINTMENT_STATUS.ACCEPTED] },
        })
        .sort({ appointmentDate: 1, appointmentTime: 1 })
        .limit(5)
        .toArray(),
      db.collection<Appointment>("appointments").countDocuments({
        patientId,
        appointmentStatus: {
          $in: [
            APPOINTMENT_STATUS.COMPLETED,
            APPOINTMENT_STATUS.REJECTED,
            APPOINTMENT_STATUS.CANCELLED,
          ],
        },
      }),
      db
        .collection<Payment>("payments")
        .aggregate<{ total: number }>([
          { $match: { patientId, paymentStatus: PAYMENT_STATUS.PAID } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ])
        .toArray(),
      db.collection("favorites").countDocuments({ patientId }),
    ]);
    success(response, {
      upcomingAppointments: upcoming,
      nextAppointment: upcoming[0] ?? null,
      historyCount,
      totalPaidAmount: paid[0]?.total ?? 0,
      favoriteDoctorsCount: favoriteCount,
    });
  }),
);

analyticsRouter.get(
  "/doctor",
  authenticate,
  requireActiveUser,
  requireRole(USER_ROLE.DOCTOR),
  requireVerifiedDoctor,
  asyncHandler(async (request, response) => {
    const doctor = await getDatabase()
      .collection<Doctor>("doctors")
      .findOne({ userId: request.principal!.appUserId });
    if (!doctor?._id) {
      throw notFound("Doctor profile");
    }
    const today = new Date().toISOString().slice(0, 10);
    const [summary] = await getDatabase()
      .collection<Appointment>("appointments")
      .aggregate([
        { $match: { doctorId: doctor._id } },
        {
          $group: {
            _id: null,
            patients: { $addToSet: "$patientId" },
            today: { $sum: { $cond: [{ $eq: ["$appointmentDate", today] }, 1, 0] } },
            pending: {
              $sum: { $cond: [{ $eq: ["$appointmentStatus", APPOINTMENT_STATUS.PENDING] }, 1, 0] },
            },
            completed: {
              $sum: {
                $cond: [{ $eq: ["$appointmentStatus", APPOINTMENT_STATUS.COMPLETED] }, 1, 0],
              },
            },
          },
        },
        {
          $project: {
            totalUniquePatients: { $size: "$patients" },
            todayAppointments: "$today",
            pendingRequests: "$pending",
            completedAppointments: "$completed",
          },
        },
      ])
      .toArray();
    success(response, {
      ...(summary ?? {
        totalUniquePatients: 0,
        todayAppointments: 0,
        pendingRequests: 0,
        completedAppointments: 0,
      }),
      reviewsReceived: doctor.reviewCount,
      averageRating: doctor.averageRating,
    });
  }),
);

analyticsRouter.get(
  "/admin",
  authenticate,
  requireActiveUser,
  requireRole(USER_ROLE.ADMIN),
  asyncHandler(async (_request, response) => {
    const db = getDatabase();
    const [
      counts,
      statuses,
      appointmentsOverTime,
      revenueOverTime,
      highestRatedDoctors,
      doctorPerformance,
    ] = await Promise.all([
      Promise.all([
        db.collection<AppUser>("app_users").countDocuments({ role: USER_ROLE.PATIENT }),
        db.collection<Doctor>("doctors").countDocuments(),
        db.collection<Appointment>("appointments").countDocuments(),
      ]),
      db
        .collection<Appointment>("appointments")
        .aggregate([
          { $group: { _id: "$appointmentStatus", count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ])
        .toArray(),
      db
        .collection<Appointment>("appointments")
        .aggregate([
          { $group: { _id: "$appointmentDate", count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
          { $limit: 365 },
        ])
        .toArray(),
      db
        .collection<Payment>("payments")
        .aggregate([
          { $match: { paymentStatus: PAYMENT_STATUS.PAID } },
          {
            $group: {
              _id: { $dateToString: { date: "$paymentDate", format: "%Y-%m-%d" } },
              revenue: { $sum: "$amount" },
            },
          },
          { $sort: { _id: 1 } },
          { $limit: 365 },
        ])
        .toArray(),
      db
        .collection<Doctor>("doctors")
        .find({ verificationStatus: VERIFICATION_STATUS.VERIFIED })
        .sort({ averageRating: -1, reviewCount: -1 })
        .limit(10)
        .project({ userId: 0 })
        .toArray(),
      db
        .collection<Appointment>("appointments")
        .aggregate([
          {
            $group: {
              _id: "$doctorId",
              appointments: { $sum: 1 },
              completed: {
                $sum: {
                  $cond: [{ $eq: ["$appointmentStatus", APPOINTMENT_STATUS.COMPLETED] }, 1, 0],
                },
              },
            },
          },
          { $lookup: { from: "doctors", localField: "_id", foreignField: "_id", as: "doctor" } },
          { $unwind: "$doctor" },
          {
            $project: {
              doctorId: "$_id",
              doctorName: "$doctor.doctorName",
              appointments: 1,
              completed: 1,
              averageRating: "$doctor.averageRating",
              _id: 0,
            },
          },
          { $sort: { completed: -1, appointments: -1 } },
          { $limit: 20 },
        ])
        .toArray(),
    ]);
    success(response, {
      totalPatients: counts[0],
      totalDoctors: counts[1],
      totalAppointments: counts[2],
      appointmentStatuses: statuses,
      appointmentsOverTime,
      revenueOverTime,
      doctorPerformance,
      highestRatedDoctors,
    });
  }),
);

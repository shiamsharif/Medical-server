import { Router } from "express";
import { ObjectId } from "mongodb";
import type { Filter } from "mongodb";
import { z } from "zod";
import { authenticate, requireActiveUser, requireRole } from "../../auth/auth.middleware.js";
import { getDatabase } from "../../config/database.js";
import { APPOINTMENT_STATUS, PAYMENT_STATUS, USER_ROLE, USER_STATUS, VERIFICATION_STATUS } from "../../constants/domain.js";
import type { AppUser, Appointment, Doctor, Payment } from "../../types/documents.js";
import { badRequest, conflict, notFound } from "../../errors/app-error.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { paginationMeta, paginationSchema, toObjectId } from "../../utils/validation.js";
import { success } from "../../utils/response.js";
import { logger } from "../../config/logger.js";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../../auth/auth.js";

export const adminRouter = Router();
adminRouter.use(authenticate, requireActiveUser, requireRole(USER_ROLE.ADMIN));

adminRouter.get("/users", asyncHandler(async (request, response) => {
  const query = paginationSchema.extend({ search: z.string().trim().max(100).optional(), role: z.nativeEnum(USER_ROLE).optional(), status: z.nativeEnum(USER_STATUS).optional() }).parse(request.query);
  const filter: Filter<AppUser> = {};
  if (query.search) filter.$or = [{ name: { $regex: query.search, $options: "i" } }, { email: { $regex: query.search, $options: "i" } }];
  if (query.role) filter.role = query.role;
  if (query.status) filter.status = query.status;
  const collection = getDatabase().collection<AppUser>("app_users");
  const [data, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).toArray(), collection.countDocuments(filter),
  ]);
  response.json({ success: true, data, meta: paginationMeta(query.page, query.limit, total) });
}));

for (const [path, status] of [["suspend", USER_STATUS.SUSPENDED], ["reactivate", USER_STATUS.ACTIVE]] as const) {
  adminRouter.patch(`/users/:id/${path}`, asyncHandler(async (request, response) => {
    const id = toObjectId(request.params.id ?? "");
    if (id.equals(request.principal!.appUserId) && status === USER_STATUS.SUSPENDED) throw conflict("Administrators cannot suspend themselves", "SELF_SUSPENSION");
    const target = await getDatabase().collection<AppUser>("app_users").findOne({ _id: id });
    if (!target) throw notFound("User");
    if (status === USER_STATUS.SUSPENDED) {
      await auth.api.banUser({ body: { userId: target.authUserId, banReason: "Suspended by MediCare administrator" }, headers: fromNodeHeaders(request.headers) });
    } else {
      await auth.api.unbanUser({ body: { userId: target.authUserId }, headers: fromNodeHeaders(request.headers) });
    }
    const result = await getDatabase().collection<AppUser>("app_users").findOneAndUpdate({ _id: id }, { $set: { status, updatedAt: new Date() } }, { returnDocument: "after" });
    if (!result) throw notFound("User");
    logger.info({ actorId: request.principal!.appUserId, targetUserId: id, status }, "Admin changed user status");
    success(response, result, `User ${path}d`);
  }));
}

adminRouter.get("/doctors", asyncHandler(async (request, response) => {
  const query = paginationSchema.extend({ status: z.nativeEnum(VERIFICATION_STATUS).optional() }).parse(request.query);
  const filter: Filter<Doctor> = query.status ? { verificationStatus: query.status } : {};
  const collection = getDatabase().collection<Doctor>("doctors");
  const [data, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).toArray(), collection.countDocuments(filter),
  ]);
  response.json({ success: true, data, meta: paginationMeta(query.page, query.limit, total) });
}));

for (const [path, status] of [["verify", VERIFICATION_STATUS.VERIFIED], ["reject", VERIFICATION_STATUS.REJECTED], ["revoke", VERIFICATION_STATUS.PENDING]] as const) {
  adminRouter.patch(`/doctors/:id/${path}`, asyncHandler(async (request, response) => {
    const id = toObjectId(request.params.id ?? "");
    const result = await getDatabase().collection<Doctor>("doctors").findOneAndUpdate({ _id: id }, { $set: { verificationStatus: status, updatedAt: new Date() } }, { returnDocument: "after" });
    if (!result) throw notFound("Doctor");
    logger.info({ actorId: request.principal!.appUserId, doctorId: id, verificationStatus: status }, "Admin changed doctor verification");
    success(response, result, `Doctor ${path} action completed`);
  }));
}

adminRouter.get("/appointments", asyncHandler(async (request, response) => {
  const query = paginationSchema.extend({ search: z.string().trim().max(100).optional(), status: z.nativeEnum(APPOINTMENT_STATUS).optional(), paymentStatus: z.nativeEnum(PAYMENT_STATUS).optional() }).parse(request.query);
  const filter: Filter<Appointment> = {};
  if (query.search) {
    filter.$or = [{ symptoms: { $regex: query.search, $options: "i" } }, { appointmentDate: query.search }];
    if (ObjectId.isValid(query.search)) filter.$or.push({ _id: new ObjectId(query.search) });
  }
  if (query.status) filter.appointmentStatus = query.status;
  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
  const collection = getDatabase().collection<Appointment>("appointments");
  const [data, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).toArray(), collection.countDocuments(filter),
  ]);
  response.json({ success: true, data, meta: paginationMeta(query.page, query.limit, total) });
}));

adminRouter.get("/payments", asyncHandler(async (request, response) => {
  const query = paginationSchema.extend({ status: z.nativeEnum(PAYMENT_STATUS).optional() }).parse(request.query);
  const filter: Filter<Payment> = query.status ? { paymentStatus: query.status } : {};
  const collection = getDatabase().collection<Payment>("payments");
  const [data, total] = await Promise.all([
    collection.find(filter).project({ processedEventIds: 0 }).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).toArray(), collection.countDocuments(filter),
  ]);
  response.json({ success: true, data, meta: paginationMeta(query.page, query.limit, total) });
}));

adminRouter.delete("/users/:id", asyncHandler(async (request, response) => {
  const id = toObjectId(request.params.id ?? "");
  const user = await getDatabase().collection<AppUser>("app_users").findOne({ _id: id });
  if (!user) throw notFound("User");
  if (user.role === USER_ROLE.ADMIN) throw badRequest("Administrator deletion requires a dedicated operational process", "UNSAFE_DELETE");
  const doctor = user.role === USER_ROLE.DOCTOR
    ? await getDatabase().collection<Doctor>("doctors").findOne({ userId: id })
    : null;
  const ownershipFilters: Filter<Appointment>[] = [{ patientId: id }];
  if (doctor?._id) ownershipFilters.push({ doctorId: doctor._id });
  const hasRecords = await getDatabase().collection<Appointment>("appointments").countDocuments({ $or: ownershipFilters });
  if (hasRecords) throw conflict("User with healthcare records cannot be deleted; suspend the account instead", "USER_HAS_RECORDS");
  await auth.api.removeUser({ body: { userId: user.authUserId }, headers: fromNodeHeaders(request.headers) });
  if (doctor?._id) await getDatabase().collection<Doctor>("doctors").deleteOne({ _id: doctor._id });
  await getDatabase().collection<AppUser>("app_users").deleteOne({ _id: id });
  response.status(204).end();
}));

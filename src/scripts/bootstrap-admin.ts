import { connectDatabase, closeDatabase } from "../config/database.js";
import { requireIntegration } from "../config/env.js";
import { USER_ROLE, USER_STATUS } from "../constants/domain.js";
import type { AppUser } from "../types/documents.js";
import { logger } from "../config/logger.js";
import { ObjectId } from "mongodb";

async function bootstrap(): Promise<void> {
  const database = await connectDatabase();
  const email = requireIntegration("ADMIN_EMAIL").toLowerCase();
  const existing = await database.collection<AppUser>("app_users").findOne({ email });
  if (existing) {
    if (existing.role !== USER_ROLE.ADMIN) {
      throw new Error("ADMIN_EMAIL already belongs to a non-admin application user");
    }
    await database
      .collection("user")
      .updateOne({ _id: new ObjectId(existing.authUserId) }, { $set: { role: "admin" } });
    logger.info({ email }, "Administrator already exists; no changes made");
    return;
  }
  const { auth } = await import("../auth/auth.js");
  const result = await auth.api.signUpEmail({
    body: {
      name: requireIntegration("ADMIN_NAME"),
      email,
      password: requireIntegration("ADMIN_PASSWORD"),
    },
  });
  // Better Auth's admin plugin owns its authorization field; only this private bootstrap may elevate it.
  await database
    .collection("user")
    .updateOne({ _id: new ObjectId(result.user.id) }, { $set: { role: "admin" } });
  const now = new Date();
  await database.collection<AppUser>("app_users").insertOne({
    authUserId: result.user.id,
    name: result.user.name,
    email,
    role: USER_ROLE.ADMIN,
    status: USER_STATUS.ACTIVE,
    createdAt: now,
    updatedAt: now,
  });
  logger.info({ email }, "Administrator bootstrapped");
}

bootstrap()
  .catch((error: unknown) => {
    logger.error({ err: error }, "Administrator bootstrap failed");
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());

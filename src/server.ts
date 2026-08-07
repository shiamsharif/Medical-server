import type { Server } from "node:http";
import { connectDatabase, closeDatabase } from "./config/database.js";
import { ensureIndexes } from "./config/indexes.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";

let server: Server | undefined;
let shuttingDown = false;

async function start(): Promise<void> {
  const database = await connectDatabase();
  await ensureIndexes(database);
  // Importing after the connection ensures Better Auth receives the same initialized MongoDB instance.
  const { app } = await import("./app.js");
  server = app.listen(env.PORT, () => logger.info({ port: env.PORT }, "MediCare Connect API started"));
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Graceful shutdown started");
  if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  logger.info("Shutdown complete");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => { void shutdown(signal).then(() => process.exit(0)).catch((error: unknown) => { logger.error({ err: error }, "Shutdown failed"); process.exit(1); }); });
}

start().catch((error: unknown) => {
  logger.fatal({ err: error }, "Application startup failed");
  void closeDatabase().finally(() => process.exit(1));
});

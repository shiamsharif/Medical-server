import type { Server } from "node:http";
import app from "./app.js";
import { closeDatabase, initializeDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";

let server: Server | undefined;
let shuttingDown = false;

async function closeHttpServer(): Promise<void> {
  if (!server?.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server?.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function start(): Promise<void> {
  await initializeDatabase();
  server = app.listen(env.PORT, () =>
    logger.info({ port: env.PORT }, "MediCare Connect API started"),
  );
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  logger.info({ signal }, "Graceful shutdown started");
  await closeHttpServer();
  await closeDatabase();

  logger.info("Shutdown complete");
}

export default app;

if (!process.env.VERCEL) {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void shutdown(signal)
        .then(() => process.exit(0))
        .catch((error: unknown) => {
          logger.error({ err: error }, "Shutdown failed");
          process.exit(1);
        });
    });
  }

  start().catch((error: unknown) => {
    logger.fatal({ err: error }, "Application startup failed");
    void closeDatabase().finally(() => process.exit(1));
  });
}

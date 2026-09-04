import { attachDatabasePool } from "@vercel/functions";
import { MongoClient } from "mongodb";
import type { Db } from "mongodb";
import { env } from "./env.js";
import { ensureIndexes } from "./indexes.js";

const client = new MongoClient(env.MONGODB_URI);
const database = client.db(env.MONGODB_DATABASE);
let connectionPromise: Promise<Db> | undefined;
let initializationPromise: Promise<Db> | undefined;
let connected = false;

if (process.env.VERCEL) {
  attachDatabasePool(client);
}

export async function connectDatabase(): Promise<Db> {
  if (connected) {
    return database;
  }

  connectionPromise ??= (async () => {
    await client.connect();
    await database.command({ ping: 1 });
    connected = true;
    return database;
  })().catch((error: unknown) => {
    connectionPromise = undefined;
    throw error;
  });

  return connectionPromise;
}

export function initializeDatabase(): Promise<Db> {
  initializationPromise ??= connectDatabase()
    .then(async (db) => {
      await ensureIndexes(db);
      return db;
    })
    .catch((error: unknown) => {
      initializationPromise = undefined;
      throw error;
    });

  return initializationPromise;
}

export function getDatabase(): Db {
  return database;
}

export async function isDatabaseHealthy(): Promise<boolean> {
  if (!connected) {
    return false;
  }
  try {
    await database.command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

export async function closeDatabase(): Promise<void> {
  await client.close();
  connected = false;
  connectionPromise = undefined;
  initializationPromise = undefined;
}

export { client as mongoClient };

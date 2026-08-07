import { MongoClient } from "mongodb";
import type { Db } from "mongodb";
import { env } from "./env.js";

const client = new MongoClient(env.MONGODB_URI);
let database: Db | undefined;

export async function connectDatabase(): Promise<Db> {
  if (database) {
    return database;
  }
  await client.connect();
  database = client.db(env.MONGODB_DATABASE);
  await database.command({ ping: 1 });
  return database;
}

export function getDatabase(): Db {
  if (!database) {
    throw new Error("Database has not been connected");
  }
  return database;
}

export async function isDatabaseHealthy(): Promise<boolean> {
  if (!database) {
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
  database = undefined;
}

export { client as mongoClient };

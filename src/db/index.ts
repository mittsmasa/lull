import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

function createDb() {
  const sqlite = new Database("local.db");
  sqlite.pragma("journal_mode = WAL");
  return drizzle({ client: sqlite, schema });
}

type DbInstance = ReturnType<typeof createDb>;

const globalForDb = globalThis as unknown as {
  db: DbInstance | undefined;
};

export const db = globalForDb.db ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.db = db;
}

import { mkdirSync, rmSync } from "node:fs";
import { beforeEach } from "vitest";

const TEST_DB_DIR = ".test-db";
const TEST_DB_PATH = `${TEST_DB_DIR}/test.db`;

rmSync(TEST_DB_DIR, { recursive: true, force: true });
mkdirSync(TEST_DB_DIR, { recursive: true });

process.env.TURSO_DATABASE_URL = `file:${TEST_DB_PATH}`;
process.env.TURSO_AUTH_TOKEN = "";

const { migrate } = await import("drizzle-orm/libsql/migrator");
const { db } = await import("@/db");
await migrate(db, { migrationsFolder: "./drizzle" });

beforeEach(async () => {
  const { resetDb } = await import("./reset");
  await resetDb();
});

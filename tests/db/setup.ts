import { mkdirSync, rmSync } from "node:fs";
import { beforeEach, vi } from "vitest";

const TEST_DB_DIR = ".test-db";
const TEST_DB_PATH = `${TEST_DB_DIR}/test.db`;

// setupFiles はテストファイルごとに再実行されるため、
// DB 削除と migrate は worker（プロセス）単位で 1 度だけ走らせる。
const initFlag = "__lull_test_db_initialized";
const alreadyInitialized = (globalThis as Record<string, unknown>)[initFlag];

if (!alreadyInitialized) {
  rmSync(TEST_DB_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DB_DIR, { recursive: true });
  (globalThis as Record<string, unknown>)[initFlag] = true;
}

process.env.TURSO_DATABASE_URL = `file:${TEST_DB_PATH}`;
process.env.TURSO_AUTH_TOKEN = "";

// Next.js / 認証ランタイムの差し替え。
// Server Action から呼ばれる next/cache, next/navigation, @/lib/session を
// テスト中に動かすため、最小限の no-op / 例外スロー実装に置き換える。
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

vi.mock("@/lib/session", () => ({
  getSession: async () => {
    return (globalThis as { __mockSession?: unknown }).__mockSession ?? null;
  },
  requireSession: async (returnTo?: string) => {
    const s = (globalThis as { __mockSession?: unknown }).__mockSession;
    if (!s) {
      const target = returnTo
        ? `/?returnTo=${encodeURIComponent(returnTo)}`
        : "/";
      throw new Error(`REDIRECT:${target}`);
    }
    return s;
  },
  validateReturnTo: (v: string | string[] | undefined) => {
    const value = Array.isArray(v) ? v[0] : v;
    if (value?.startsWith("/") && !value.startsWith("//")) return value;
    return "/dashboard";
  },
}));

const migrateFlag = "__lull_test_db_migrated";
if (!(globalThis as Record<string, unknown>)[migrateFlag]) {
  const { migrate } = await import("drizzle-orm/libsql/migrator");
  const { db } = await import("@/db");
  await migrate(db, { migrationsFolder: "./drizzle" });
  (globalThis as Record<string, unknown>)[migrateFlag] = true;
}

beforeEach(async () => {
  (globalThis as { __mockSession?: unknown }).__mockSession = null;
  const { resetDb } = await import("./reset");
  await resetDb();
});

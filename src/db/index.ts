import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { cache } from "react";
import * as schema from "./schema";

type DbInstance = BetterSQLite3Database<typeof schema>;

/**
 * DB インスタンスを取得する。
 * - 本番（Cloudflare Workers）: D1 バインディング経由
 * - 開発（ローカル）: better-sqlite3 経由
 *
 * Cloudflare Workers ではリクエストごとにインスタンスを生成する必要があるため、
 * React.cache() でリクエスト単位にメモ化している。
 */
export const getDb = cache((): DbInstance => {
  if (process.env.NODE_ENV === "production") {
    const {
      getCloudflareContext,
      // eslint-disable-next-line @typescript-eslint/no-require-imports
    } =
      require("@opennextjs/cloudflare") as typeof import("@opennextjs/cloudflare");
    const {
      drizzle,
      // eslint-disable-next-line @typescript-eslint/no-require-imports
    } = require("drizzle-orm/d1") as typeof import("drizzle-orm/d1");
    const { env } = getCloudflareContext();
    return drizzle((env as Record<string, unknown>).DB as D1Database, {
      schema,
    }) as unknown as DbInstance;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3") as typeof import("better-sqlite3");
  const {
    drizzle,
    // eslint-disable-next-line @typescript-eslint/no-require-imports
  } =
    require("drizzle-orm/better-sqlite3") as typeof import("drizzle-orm/better-sqlite3");
  const sqlite = new Database("local.db");
  sqlite.pragma("journal_mode = WAL");
  return drizzle({ client: sqlite, schema });
});

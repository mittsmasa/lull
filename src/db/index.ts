import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

type DbInstance = ReturnType<typeof drizzle<typeof schema>>;

let _cachedDb: DbInstance | null = null;

const getOrCreateDb = () => {
  if (!_cachedDb) {
    const { env } = getCloudflareContext();
    _cachedDb = drizzle(env.DB, { schema });
  }
  return _cachedDb;
};

// Proxy で遅延評価 — 呼び出し側は db.query... / db.select(...) のまま
export const db: DbInstance = new Proxy({} as DbInstance, {
  get(_, prop) {
    return Reflect.get(getOrCreateDb(), prop);
  },
});

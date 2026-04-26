import { getTableName, sql } from "drizzle-orm";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import { db } from "@/db";
import * as schema from "@/db/schema";

export async function resetDb() {
  const tables = Object.values(schema).filter(
    (v) => v instanceof SQLiteTable,
  ) as SQLiteTable[];
  await db.run(sql`PRAGMA foreign_keys = OFF`);
  for (const table of tables) {
    const name = getTableName(table);
    await db.run(sql.raw(`DELETE FROM "${name}"`));
  }
  await db.run(sql`PRAGMA foreign_keys = ON`);
}

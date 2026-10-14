import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type DB = BetterSQLite3Database<typeof schema>;

const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

export function createDb(file: string): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db;
}

const g = globalThis as unknown as { __workbenchDb?: DB };

/** Process-wide database handle (survives dev hot reloads). */
export function getDb(): DB {
  if (!g.__workbenchDb) {
    g.__workbenchDb = createDb(process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "workbench.db"));
  }
  return g.__workbenchDb;
}

/** Tests swap in an isolated in-memory database. */
export function setDbForTesting(db: DB) {
  g.__workbenchDb = db;
}

export { schema };

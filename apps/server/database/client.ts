import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import * as schema from "./schema.ts";

export type Db = BunSQLiteDatabase<typeof schema>;

const DB_PATH = process.env.DATABASE_PATH ?? "./data/scraper.db";
const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../drizzle");

function createConnection(path: string): Database {
  if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });

  const sqlite = new Database(path, { create: true });
  // WAL keeps reads from blocking while a scrape writes results.
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec("PRAGMA busy_timeout = 5000;");
  sqlite.exec("PRAGMA synchronous = NORMAL;");
  return sqlite;
}

export const sqlite = createConnection(DB_PATH);
export const db: Db = drizzle(sqlite, { schema });

/** Apply any pending migrations from `drizzle/`. Safe to call repeatedly. */
export function runMigrations(target: Db = db): void {
  migrate(target, { migrationsFolder: MIGRATIONS_FOLDER });
}

/** In-memory database with migrations applied — used by tests. */
export function createTestDb(): { db: Db; close: () => void } {
  const conn = createConnection(":memory:");
  const testDb = drizzle(conn, { schema });
  migrate(testDb, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db: testDb, close: () => conn.close() };
}

export { schema };

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import * as schema from "./schema";

const file = process.env.DATABASE_FILE ?? path.join(process.cwd(), "data.db");

// Next dev reloads modules constantly; one connection per process is plenty.
const globalForDb = globalThis as unknown as { __sqlite?: Database.Database };

const sqlite =
  globalForDb.__sqlite ??
  (() => {
    const db = new Database(file);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    return db;
  })();

if (process.env.NODE_ENV !== "production") globalForDb.__sqlite = sqlite;

export const db = drizzle(sqlite, { schema });
export { sqlite, schema };

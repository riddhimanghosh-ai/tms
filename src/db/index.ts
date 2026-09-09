import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

// The HTTP driver can't do transactions, and overselling protection depends on
// them — so this uses the WebSocket pool. Node needs a `ws` implementation;
// the edge and browser runtimes already have one.
if (typeof WebSocket === "undefined") neonConfig.webSocketConstructor = ws;

const globalForDb = globalThis as unknown as { __pool?: Pool };

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  return new Pool({ connectionString: url });
}

// Next reloads modules constantly in dev; one pool per process is plenty.
const pool = globalForDb.__pool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.__pool = pool;

export const db = drizzle(pool, { schema });
export { pool, schema };

/**
 * Drizzle's Postgres driver always resolves to an array. This is the
 * single-row helper the SQLite driver used to provide, so call sites that
 * want one row still read as one line.
 */
export async function first<T>(query: PromiseLike<T[]>): Promise<T | undefined> {
  const rows = await query;
  return rows[0];
}

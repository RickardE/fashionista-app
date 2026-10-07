import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema";

/** Any Drizzle Postgres database with our schema (postgres-js in the app, PGlite in tests). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

// Kept on globalThis so Next's dev hot-reload reuses one pool instead of
// opening a new one per reload.
const globalForDb = globalThis as unknown as { __styleaiDb?: { db: Db; close: () => Promise<void> } };

export function getDb(): Db {
  return connect().db;
}

export function connect(): { db: Db; close: () => Promise<void> } {
  if (globalForDb.__styleaiDb) return globalForDb.__styleaiDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
  const client = postgres(url, { max: Number(process.env.DATABASE_POOL_MAX ?? 10) });
  const db = drizzle(client, { schema }) as unknown as Db;
  globalForDb.__styleaiDb = {
    db,
    close: async () => {
      await client.end();
      globalForDb.__styleaiDb = undefined;
    },
  };
  return globalForDb.__styleaiDb;
}

export { schema };

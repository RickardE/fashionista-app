import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema";

/** Any Drizzle Postgres database with our schema (postgres-js in the app, PGlite in tests). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

// Kept on globalThis so Next's dev hot-reload reuses one pool instead of
// opening a new one per reload.
const globalForDb = globalThis as unknown as { __styleaiDb?: { db: Db; close: () => Promise<void> } };

/**
 * URL parameters only libpq understands. postgres.js forwards unknown query
 * parameters to the server as startup settings, which Postgres rejects — and
 * hosted providers (e.g. Neon) include `channel_binding=require` by default.
 */
const LIBPQ_ONLY_PARAMS = ["channel_binding"];

export function connectionUrl(raw: string): string {
  const url = new URL(raw);
  for (const param of LIBPQ_ONLY_PARAMS) url.searchParams.delete(param);
  return url.toString();
}

export function getDb(): Db {
  return connect().db;
}

/**
 * The app connects through DATABASE_URL (on serverless hosting, the provider's
 * pooled URL). CLI scripts pass `direct: true` to prefer DATABASE_URL_UNPOOLED
 * when set — migrations and long imports belong on a direct connection.
 */
export function connect(opts: { direct?: boolean } = {}): { db: Db; close: () => Promise<void> } {
  if (globalForDb.__styleaiDb) return globalForDb.__styleaiDb;
  const raw = (opts.direct && process.env.DATABASE_URL_UNPOOLED) || process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set (see .env.example)");
  const client = postgres(connectionUrl(raw), {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    // Release idle connections so suspended serverless instances and
    // autosuspending databases don't hold stale sockets.
    idle_timeout: Number(process.env.DATABASE_IDLE_TIMEOUT ?? 20),
  });
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

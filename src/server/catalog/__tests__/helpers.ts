import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import type { Logger } from "@/server/log";
import { JOHNELLS_MAPPING } from "../sources/adtraction/johnells";
import { FeedParseError, parseGoogleShoppingFeed } from "../sources/google-shopping-xml";
import type { ProductSource } from "../types";

/** A fresh in-process Postgres with all migrations applied. */
export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return { db: db as unknown as Db, close: () => client.close() };
}

/** A source whose feed content can be swapped between imports. */
export function memorySource(initialXml: string): ProductSource & { setXml(xml: string): void } {
  let xml = initialXml;
  return {
    identity: { key: "test:johnells", provider: "test", merchant: "Johnells" },
    mapping: JOHNELLS_MAPPING,
    setXml(next) {
      xml = next;
    },
    async fetch() {
      return {
        modified: true,
        rows: parseGoogleShoppingFeed(xml, { defaultCurrency: "SEK" }),
        meta: { fetchedAt: new Date(), location: "memory" },
      };
    },
  };
}

export { FeedParseError };

export const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child: () => silentLogger,
};

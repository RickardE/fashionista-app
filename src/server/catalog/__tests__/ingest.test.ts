import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import { importRuns, offers, products, rawItems, variants } from "@/server/db/schema";
import { importFromSource } from "../ingest";
import { FULL_FEED, KNIT_ROWS, SHIRT_ROWS, TROUSER_ROWS, feedXml } from "./fixtures/feed";
import { FeedParseError, createTestDb, memorySource, silentLogger } from "./helpers";

let db: Db;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
});
afterEach(async () => {
  await close();
});

const run = (source: ReturnType<typeof memorySource>, opts = {}) =>
  importFromSource(db, source, { logger: silentLogger, ...opts });

describe("catalog import", () => {
  it("imports grouped canonical products with offers and variants", async () => {
    const result = await run(memorySource(FULL_FEED));

    expect(result.status).toBe("succeeded");
    expect(result.stats).toMatchObject({
      rowsReceived: 8,
      rowsInvalid: 2,
      groups: 3,
      productsCreated: 3,
      variantsUpserted: 6,
    });

    const all = await db.select().from(products);
    expect(all).toHaveLength(3);
    const shirt = all.find((p) => p.name === "Linneskjorta Relaxed")!;
    expect(shirt).toMatchObject({
      category: "shirts",
      gender: "men",
      colors: ["black"],
      status: "active",
      isAvailable: true,
      priceMinor: 129900,
      salePriceMinor: 99900,
      currency: "SEK",
    });
    expect(await db.select().from(offers)).toHaveLength(3);
    expect(await db.select().from(variants)).toHaveLength(6);
    expect(await db.select().from(rawItems)).toHaveLength(6);
  });

  it("is idempotent: importing three times keeps one product per identity", async () => {
    const source = memorySource(FULL_FEED);
    await run(source);
    await run(source);
    const third = await run(source);

    expect(third.stats).toMatchObject({ productsCreated: 0, productsUpdated: 0, productsUnchanged: 3 });
    expect(await db.select().from(products)).toHaveLength(3);
    expect(await db.select().from(offers)).toHaveLength(3);
    expect(await db.select().from(variants)).toHaveLength(6);
  });

  it("keeps product ids stable and updates changed content in place", async () => {
    const source = memorySource(FULL_FEED);
    await run(source);
    const [before] = await db.select().from(products).where(eq(products.name, "Wool Trousers"));

    source.setXml(
      feedXml([
        ...SHIRT_ROWS,
        ...TROUSER_ROWS.map((r) => ({ ...r, title: "Wool Trousers Pleated", price: "1999.00 SEK" })),
        ...KNIT_ROWS,
      ]),
    );
    const second = await run(source);
    expect(second.stats).toMatchObject({ productsCreated: 0, productsUpdated: 1, productsUnchanged: 2 });

    const [after] = await db.select().from(products).where(eq(products.id, before.id));
    expect(after.name).toBe("Wool Trousers Pleated");
    expect(after.priceMinor).toBe(199900);
  });

  it("marks products missing from a full feed inactive, and reactivates them on return", async () => {
    const source = memorySource(FULL_FEED);
    await run(source);

    source.setXml(feedXml([...SHIRT_ROWS, ...TROUSER_ROWS]));
    const second = await run(source);
    expect(second.stats).toMatchObject({ productsDeactivated: 1, offersDeactivated: 1, variantsDeactivated: 1 });
    const [knit] = await db.select().from(products).where(eq(products.name, "Merino Rollneck"));
    expect(knit.status).toBe("inactive");
    expect(knit.deactivatedAt).not.toBeNull();
    expect(await db.select().from(products)).toHaveLength(3); // never deleted

    source.setXml(FULL_FEED);
    const third = await run(source);
    expect(third.stats.productsReactivated).toBe(1);
    const [back] = await db.select().from(products).where(eq(products.id, knit.id));
    expect(back.status).toBe("active");
    expect(back.deactivatedAt).toBeNull();
  });

  it("marks a product unavailable (not inactive) when all its sizes are out of stock", async () => {
    const source = memorySource(FULL_FEED);
    await run(source);
    source.setXml(
      feedXml([...SHIRT_ROWS.map((r) => ({ ...r, availability: "out of stock" })), ...TROUSER_ROWS, ...KNIT_ROWS]),
    );
    await run(source);
    const [shirt] = await db.select().from(products).where(eq(products.name, "Linneskjorta Relaxed"));
    expect(shirt).toMatchObject({ status: "active", isAvailable: false });
  });

  it("never deactivates anything on a subset (--limit) run", async () => {
    const source = memorySource(FULL_FEED);
    await run(source);
    const subset = await run(source, { limitGroups: 1 });
    expect(subset.stats).toMatchObject({ groupsSkippedByLimit: 2, productsDeactivated: 0 });
    const active = await db.select().from(products).where(eq(products.status, "active"));
    expect(active).toHaveLength(3);
  });

  it("skips deactivation when the feed shrinks suspiciously, unless forced", async () => {
    const source = memorySource(FULL_FEED);
    await run(source);
    source.setXml(feedXml(KNIT_ROWS)); // 1 of 6 variants

    const guarded = await run(source);
    expect(guarded.stats.productsDeactivated).toBe(0);
    expect(guarded.warnings.join()).toMatch(/skipping deactivation/);

    const forced = await run(source, { force: true });
    expect(forced.stats.productsDeactivated).toBe(2);
  });

  it("records a failed run and rethrows when the feed is malformed", async () => {
    const source = memorySource("<rss><channel><item><g:id>1</item>");
    await expect(run(source)).rejects.toThrow(FeedParseError);
    const [record] = await db.select().from(importRuns);
    expect(record.status).toBe("failed");
    expect(record.error).toMatch(/Malformed XML/);
  });

  it("refuses to start while another import of the same source is running", async () => {
    await db.insert(importRuns).values({ sourceKey: "test:johnells", mode: "full", status: "running" });
    await expect(run(memorySource(FULL_FEED))).rejects.toThrow(/already running/);
  });
});

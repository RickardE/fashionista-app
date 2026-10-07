import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importFromSource } from "@/server/catalog/ingest";
import { createTestDb, memorySource, silentLogger } from "@/server/catalog/__tests__/helpers";
import { FULL_FEED, SHIRT_ROWS, TROUSER_ROWS, feedXml } from "@/server/catalog/__tests__/fixtures/feed";
import type { Db } from "@/server/db/client";
import { offers, products } from "@/server/db/schema";
import {
  getFeedPage,
  getProduct,
  getProductsByIds,
  getShopUrl,
  listProducts,
  searchProducts,
  searchTokens,
} from "../service";

let db: Db;
let close: () => Promise<void>;
let ids: { shirt: string; trousers: string; knit: string };

const idOf = async (name: string) =>
  (await db.select({ id: products.id }).from(products).where(eq(products.name, name)))[0].id;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await importFromSource(db, memorySource(FULL_FEED), { logger: silentLogger });
  ids = {
    shirt: await idOf("Linneskjorta Relaxed"),
    trousers: await idOf("Wool Trousers"),
    knit: await idOf("Merino Rollneck"),
  };
});
afterAll(async () => {
  await close();
});

describe("feed", () => {
  it("returns active products as STYLEAI DTOs", async () => {
    const page = await getFeedPage(db, { limit: 10 });
    expect(page.products).toHaveLength(3);
    expect(page.nextCursor).toBeNull();
    const shirt = page.products.find((p) => p.id === ids.shirt)!;
    expect(shirt).toEqual({
      id: ids.shirt,
      brand: "Oscar Jacobson",
      name: "Linneskjorta Relaxed",
      price: 999,
      currency: "SEK",
      image: "https://img.johnells.se/LIN-100.jpg",
      productType: "clothing",
      category: "shirts",
      subcategory: "linen shirt",
      gender: "men",
      color: "Black",
      colors: ["black"],
      material: undefined,
      retailer: "Johnells",
      sizes: ["S", "M", "L"],
      available: true,
      shopUrl: `/api/products/${ids.shirt}/shop`,
      tags: expect.arrayContaining(["black", "neutral", "natural", "relaxed"]),
    });
  });

  it("never exposes source identifiers", async () => {
    const page = await getFeedPage(db, { limit: 10 });
    // Image URLs are the merchant's own asset paths; everything else must be STYLEAI's.
    const json = JSON.stringify(page.products.map((p) => ({ ...p, image: undefined })));
    expect(json).not.toMatch(/LIN-100|item_group_id|externalId|go\.johnells|johnells\.se\/p\//);
  });

  it("respects the limit and paginates without overlap or gaps", async () => {
    const first = await getFeedPage(db, { limit: 2 });
    expect(first.products).toHaveLength(2);
    expect(first.nextCursor).toBe(first.products[1].id);
    const second = await getFeedPage(db, { limit: 2, cursor: first.nextCursor! });
    expect(second.products).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    const all = [...first.products, ...second.products].map((p) => p.id);
    expect(new Set(all)).toEqual(new Set(Object.values(ids)));
  });

  it("keeps a stable order across calls", async () => {
    const a = (await getFeedPage(db, { limit: 10 })).products.map((p) => p.id);
    const b = (await getFeedPage(db, { limit: 10 })).products.map((p) => p.id);
    expect(a).toEqual(b);
  });
});

describe("availability", () => {
  let local: Db;
  let closeLocal: () => Promise<void>;

  beforeAll(async () => {
    ({ db: local, close: closeLocal } = await createTestDb());
    const source = memorySource(FULL_FEED);
    await importFromSource(local, source, { logger: silentLogger });
    // Knit disappears from the feed → inactive.
    source.setXml(feedXml([...SHIRT_ROWS, ...TROUSER_ROWS]));
    await importFromSource(local, source, { logger: silentLogger });
  });
  afterAll(async () => {
    await closeLocal();
  });

  it("excludes inactive products from the feed, lists and search", async () => {
    const feed = await getFeedPage(local, { limit: 10 });
    expect(feed.products.map((p) => p.name)).not.toContain("Merino Rollneck");
    expect((await listProducts(local, { categories: ["knitwear"], limit: 10 })).length).toBe(0);
    expect(await searchProducts(local, "merino", { limit: 10 })).toEqual([]);
  });

  it("still resolves an inactive product by id, flagged unavailable", async () => {
    const [{ id }] = await local.select({ id: products.id }).from(products).where(eq(products.name, "Merino Rollneck"));
    const product = await getProduct(local, id);
    expect(product).toMatchObject({ id, available: false, sizes: [] });
  });
});

describe("product by id", () => {
  it("returns an existing product", async () => {
    expect(await getProduct(db, ids.knit)).toMatchObject({ id: ids.knit, name: "Merino Rollneck", gender: "women" });
  });

  it("returns null for unknown or malformed ids", async () => {
    expect(await getProduct(db, "00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(await getProduct(db, "nn07-overshirt")).toBeNull();
    expect(await getProduct(db, "'; drop table products; --")).toBeNull();
  });

  it("resolves several ids in request order, skipping unknown ones", async () => {
    const found = await getProductsByIds(db, [ids.knit, "nope", ids.shirt, ids.knit]);
    expect(found.map((p) => p.id)).toEqual([ids.knit, ids.shirt]);
  });
});

describe("listing by canonical fields", () => {
  it("filters by category and gender (unisex/unknown included)", async () => {
    expect((await listProducts(db, { categories: ["trousers"], limit: 10 })).map((p) => p.id)).toEqual([ids.trousers]);
    const forWomen = await listProducts(db, { gender: "women", limit: 10 });
    expect(forWomen.map((p) => p.id)).toEqual([ids.knit]);
  });

  it("excludes given ids", async () => {
    const list = await listProducts(db, { excludeIds: [ids.shirt], limit: 10 });
    expect(list.map((p) => p.id)).not.toContain(ids.shirt);
  });
});

describe("search", () => {
  it("finds products by name, brand, canonical category and colour", async () => {
    expect((await searchProducts(db, "rollneck", { limit: 10 }))[0]?.id).toBe(ids.knit);
    expect((await searchProducts(db, "oscar jacobson", { limit: 10 })).length).toBe(3);
    expect((await searchProducts(db, "trousers", { limit: 10 }))[0]?.id).toBe(ids.trousers);
    expect((await searchProducts(db, "white", { limit: 10 })).map((p) => p.id)).toEqual([ids.knit]);
  });

  it("matches the merchant's own colour words and description", async () => {
    expect((await searchProducts(db, "svart", { limit: 10 })).map((p) => p.id)).toContain(ids.shirt);
    expect((await searchProducts(db, "linne", { limit: 10 }))[0]?.id).toBe(ids.shirt);
  });

  it("ranks products matching more terms first", async () => {
    const results = await searchProducts(db, "black linen shirt", { limit: 10 });
    expect(results[0].id).toBe(ids.shirt);
  });

  it("supports prefix matching", async () => {
    expect((await searchProducts(db, "trous", { limit: 10 }))[0]?.id).toBe(ids.trousers);
  });

  it("returns nothing for empty or symbol-only queries", async () => {
    expect(await searchProducts(db, "", { limit: 10 })).toEqual([]);
    expect(await searchProducts(db, "  !!& |:* ", { limit: 10 })).toEqual([]);
    expect(await searchProducts(db, "zzzznothing", { limit: 10 })).toEqual([]);
  });

  it("sanitizes tsquery syntax out of user input", () => {
    expect(searchTokens("black & (shirt) | !wool:*")).toEqual(["black", "shirt", "wool"]);
  });
});

describe("shop URL", () => {
  it("comes from the product's offer", async () => {
    const [offer] = await db.select({ url: offers.url }).from(offers).where(eq(offers.productId, ids.shirt));
    expect(await getShopUrl(db, ids.shirt)).toBe(offer.url);
    expect(offer.url).toBe("https://www.johnells.se/p/LIN-100");
  });

  it("is null for unknown products", async () => {
    expect(await getShopUrl(db, "00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(await getShopUrl(db, "not-a-uuid")).toBeNull();
  });
});

describe("variants", () => {
  it("are represented as ordered sizes; out-of-stock sizes stay listed while the variant is active", async () => {
    const trousers = await getProduct(db, ids.trousers);
    expect(trousers?.sizes).toEqual(["48", "50"]);
    expect(trousers?.available).toBe(true);
  });
});

import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { importFromSource } from "@/server/catalog/ingest";
import { createTestDb, memorySource, silentLogger } from "@/server/catalog/__tests__/helpers";
import { feedXml, type FixtureItem } from "@/server/catalog/__tests__/fixtures/feed";
import type { Db } from "@/server/db/client";
import { products } from "@/server/db/schema";
import type { Product } from "@/lib/types";
import { getFeedPage, getInspiration, getProduct, getProductsByIds, listProducts, searchProducts } from "../service";
import { activeTestCatalogue, TEST_CATALOGUES } from "../test-catalogue";
import { activateEnrichment } from "./enrichment-helpers";

let db: Db;
vi.mock("@/server/db/client", () => ({ getDb: () => db }));
const { GET: feedRoute } = await import("@/app/api/feed/route");
const { GET: productsRoute } = await import("@/app/api/products/route");
const { GET: productRoute } = await import("@/app/api/products/[id]/route");
const { GET: searchRoute } = await import("@/app/api/search/route");
const { GET: inspirationRoute } = await import("@/app/api/inspiration/route");

let close: () => Promise<void>;

const item = (id: string, title: string, productType: string): FixtureItem => ({
  id: `${id}-M`,
  group: id,
  title,
  gender: "male",
  productType: [productType],
  color: "Black",
  size: "M",
});

/**
 * in     listed and enriched          → visible in test mode
 * shoe   listed and enriched (shoes)  → visible in outfit paths only
 * bare   listed, never enriched       → hidden
 * stale  listed, enrichment outdated  → hidden
 * other  enriched, not listed         → hidden
 */
const CATALOG = [
  item("IN", "Oxford Shirt In", "Man > Kläder > Skjortor"),
  item("SHOE", "Leather Sneaker In", "Man > Skor > Sneakers"),
  item("BARE", "Wool Trousers Bare", "Man > Kläder > Byxor"),
  item("STALE", "Linen Shirt Stale", "Man > Kläder > Skjortor"),
  item("OTHER", "Cotton Shirt Other", "Man > Kläder > Skjortor"),
];
const id: Record<string, string> = {};

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await importFromSource(db, memorySource(feedXml(CATALOG)), { logger: silentLogger });
  const keyOf: Record<string, string> = {
    "Oxford Shirt In": "in",
    "Leather Sneaker In": "inShoe",
    "Wool Trousers Bare": "bare",
    "Linen Shirt Stale": "stale",
    "Cotton Shirt Other": "other",
  };
  for (const row of await db.select({ id: products.id, name: products.name }).from(products)) id[keyOf[row.name]] = row.id;
  for (const key of ["in", "inShoe", "stale", "other"]) await activateEnrichment(db, id[key]);
  // The stale product's content changed after it was enriched.
  await db.update(products).set({ contentHash: "edited" }).where(eq(products.id, id.stale));
  TEST_CATALOGUES.fixture = { name: "fixture", ids: [id.in, id.inShoe, id.bare, id.stale] };
});
afterAll(async () => {
  delete TEST_CATALOGUES.fixture;
  await close();
});
afterEach(() => {
  delete process.env.TEST_CATALOGUE;
});

const enable = () => {
  process.env.TEST_CATALOGUE = "fixture";
};
const names = (list: Product[]) => list.map((p) => p.name).sort();
const req = (path: string) => new Request(`http://localhost${path}`);
const ctx = (productId: string) => ({ params: Promise.resolve({ id: productId }) });
const json = async (res: Response) => (await res.json()) as { products?: Product[]; product?: Product; tiles?: { product: Product }[] };

describe("test catalogue restriction", () => {
  it("is off by default and when TEST_CATALOGUE is empty", () => {
    expect(activeTestCatalogue({})).toBeNull();
    expect(activeTestCatalogue({ TEST_CATALOGUE: "  " })).toBeNull();
  });

  it("leaves every query path untouched when off", async () => {
    expect(names((await getFeedPage(db, { kind: "outfits", limit: 50 })).products)).toHaveLength(5);
    expect(names((await getFeedPage(db, { kind: "products", limit: 50 })).products)).toHaveLength(4);
    expect(await listProducts(db, { limit: 50 })).toHaveLength(5);
    expect(await searchProducts(db, "shirt", { limit: 50 })).toHaveLength(3);
    expect(await getProduct(db, id.other)).not.toBeNull();
  });

  it("limits the products and outfits feeds to listed, currently enriched products", async () => {
    enable();
    expect(names((await getFeedPage(db, { kind: "products", limit: 50 })).products)).toEqual(["Oxford Shirt In"]);
    expect(names((await getFeedPage(db, { kind: "outfits", limit: 50 })).products)).toEqual(["Leather Sneaker In", "Oxford Shirt In"]);
  });

  it("limits outfit candidates, search, inspiration and lookups by id", async () => {
    enable();
    expect(names(await listProducts(db, { limit: 50 }))).toEqual(["Leather Sneaker In", "Oxford Shirt In"]);
    expect(names(await listProducts(db, { categories: ["shirts"], limit: 50 }))).toEqual(["Oxford Shirt In"]);
    expect(names(await searchProducts(db, "shirt", { limit: 50 }))).toEqual(["Oxford Shirt In"]);
    expect((await getInspiration(db)).map((t) => t.product.name)).not.toContain("Cotton Shirt Other");
    expect(names(await getProductsByIds(db, Object.values(id)))).toEqual(["Leather Sneaker In", "Oxford Shirt In"]);
    for (const hidden of [id.bare, id.stale, id.other]) expect(await getProduct(db, hidden)).toBeNull();
  });

  it("is enforced by the API routes", async () => {
    enable();
    expect(names((await json(await feedRoute(req("/api/feed?for=outfits&limit=50")))).products!)).toEqual(["Leather Sneaker In", "Oxford Shirt In"]);
    expect(names((await json(await productsRoute(req("/api/products?limit=50")))).products!)).toEqual(["Leather Sneaker In", "Oxford Shirt In"]);
    expect(names((await json(await productsRoute(req(`/api/products?ids=${id.other},${id.in}`)))).products!)).toEqual(["Oxford Shirt In"]);
    expect((await productRoute(req(`/api/products/${id.other}`), ctx(id.other))).status).toBe(404);
    expect((await productRoute(req(`/api/products/${id.in}`), ctx(id.in))).status).toBe(200);
    expect(names((await json(await searchRoute(req("/api/search?q=shirt")))).products!)).toEqual(["Oxford Shirt In"]);
    const tiles = (await json(await inspirationRoute(req("/api/inspiration")))).tiles!;
    expect(tiles.every((t) => t.product.name === "Oxford Shirt In")).toBe(true);
  });

  it("fails closed on an unknown catalogue name", async () => {
    process.env.TEST_CATALOGUE = "typo";
    expect(() => activeTestCatalogue()).toThrow(/not a known test catalogue/);
    await expect(getFeedPage(db, { limit: 10 })).rejects.toThrow(/not a known test catalogue/);
    expect((await feedRoute(req("/api/feed"))).status).toBe(500);
  });

  it("ships the approved user-test-1 catalogue: 125 unique product ids", () => {
    const catalogue = activeTestCatalogue({ TEST_CATALOGUE: "user-test-1" })!;
    expect(catalogue.ids).toHaveLength(125);
    expect(new Set(catalogue.ids).size).toBe(125);
  });
});

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { importFromSource } from "@/server/catalog/ingest";
import { createTestDb, memorySource, silentLogger } from "@/server/catalog/__tests__/helpers";
import { FULL_FEED } from "@/server/catalog/__tests__/fixtures/feed";
import type { Db } from "@/server/db/client";
import { products } from "@/server/db/schema";

// Route handlers read the app's DB singleton; point it at the test database.
let db: Db;
vi.mock("@/server/db/client", () => ({ getDb: () => db }));

const { GET: feed } = await import("@/app/api/feed/route");
const { GET: list } = await import("@/app/api/products/route");
const { GET: one } = await import("@/app/api/products/[id]/route");
const { GET: shop } = await import("@/app/api/products/[id]/shop/route");
const { GET: search } = await import("@/app/api/search/route");

let close: () => Promise<void>;
let shirtId: string;

const req = (path: string) => new Request(`http://localhost${path}`);
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await importFromSource(db, memorySource(FULL_FEED), { logger: silentLogger });
  [{ id: shirtId }] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.name, "Linneskjorta Relaxed"));
});
afterAll(async () => {
  await close();
});

describe("GET /api/feed", () => {
  it("returns a page and a cursor", async () => {
    const res = await feed(req("/api/feed?limit=2"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.products).toHaveLength(2);
    expect(body.nextCursor).toBe(body.products[1].id);
  });

  it.each(["limit=0", "limit=500", "limit=abc", "cursor=not-a-uuid"])("rejects %s with 400", async (q) => {
    const res = await feed(req(`/api/feed?${q}`));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_request");
  });
});

describe("GET /api/products", () => {
  it("resolves ids", async () => {
    const res = await list(req(`/api/products?ids=${shirtId},unknown`));
    expect((await res.json()).products.map((p: { id: string }) => p.id)).toEqual([shirtId]);
  });

  it("filters by canonical category", async () => {
    const res = await list(req("/api/products?category=knitwear&gender=women"));
    expect((await res.json()).products.map((p: { name: string }) => p.name)).toEqual(["Merino Rollneck"]);
  });

  it("rejects unknown categories and mixing ids with filters", async () => {
    expect((await list(req("/api/products?category=Linneskjortor"))).status).toBe(400);
    expect((await list(req(`/api/products?ids=${shirtId}&category=shirts`))).status).toBe(400);
  });
});

describe("GET /api/products/:id", () => {
  it("returns the product", async () => {
    const res = await one(req(`/api/products/${shirtId}`), ctx(shirtId));
    expect(res.status).toBe(200);
    expect((await res.json()).product.name).toBe("Linneskjorta Relaxed");
  });

  it("404s for unknown ids", async () => {
    const res = await one(req("/api/products/nn07-overshirt"), ctx("nn07-overshirt"));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("product_not_found");
  });
});

describe("GET /api/products/:id/shop", () => {
  it("redirects to the merchant URL from the offer", async () => {
    const res = await shop(req(`/api/products/${shirtId}/shop`), ctx(shirtId));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://www.johnells.se/p/LIN-100");
  });

  it("404s instead of redirecting for unknown ids", async () => {
    const res = await shop(req("/api/products/x/shop"), ctx("x"));
    expect(res.status).toBe(404);
  });
});

describe("GET /api/search", () => {
  it("returns matching products", async () => {
    const res = await search(req("/api/search?q=rollneck"));
    expect((await res.json()).products.map((p: { name: string }) => p.name)).toEqual(["Merino Rollneck"]);
  });

  it("returns an empty list for an empty query", async () => {
    const res = await search(req("/api/search?q="));
    expect(res.status).toBe(200);
    expect((await res.json()).products).toEqual([]);
  });
});

describe("failures", () => {
  it("turn into a 500 JSON error, not a crash", async () => {
    const realDb = db;
    db = { select: () => { throw new Error("connection refused"); } } as unknown as Db;
    try {
      const res = await feed(req("/api/feed"));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "internal_error" });
    } finally {
      db = realDb;
    }
  });
});

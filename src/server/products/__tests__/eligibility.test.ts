import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { importFromSource } from "@/server/catalog/ingest";
import { createTestDb, memorySource, silentLogger } from "@/server/catalog/__tests__/helpers";
import { feedXml, type FixtureItem } from "@/server/catalog/__tests__/fixtures/feed";
import type { Db } from "@/server/db/client";
import type { Product } from "@/lib/types";
import { getFeedPage, getInspiration, listProducts, searchProducts } from "../service";

let db: Db;
vi.mock("@/server/db/client", () => ({ getDb: () => db }));
const { GET: feedRoute } = await import("@/app/api/feed/route");
const { GET: productsRoute } = await import("@/app/api/products/route");

let close: () => Promise<void>;

const item = (id: string, title: string, gender: string, productType: string, extra: Partial<FixtureItem> = {}): FixtureItem => ({
  id: `${id}-M`,
  group: id,
  title,
  gender,
  productType: [productType],
  color: "Black",
  size: "M",
  ...extra,
});

/** One product per eligibility case. Names say what each one is. */
const CATALOG = [
  item("MS", "Mens Oxford Shirt", "male", "Man > Kläder > Skjortor"),
  item("MT", "Mens Wool Trousers", "male", "Man > Kläder > Byxor"),
  item("WD", "Womens Linen Dress", "female", "Kvinna > Kläder > Klänningar"),
  item("WK", "Womens Merino Cardigan", "female", "Kvinna > Kläder > Hoodies & Tröjor > Cardigans"),
  item("US", "Unisex College Sweatshirt", "unisex", "Kampanjer > 2609 Medlemshelg 20%"),
  item("MSH", "Mens Leather Sneaker", "male", "Man > Skor > Sneakers"),
  item("WSH", "Womens Suede Boots", "female", "Kvinna > Skor > Vinterskor"),
  item("USH", "Hav. Top Senses", "unisex", "Kampanjer > 2609 Medlemshelg 20%", { brand: "Havaianas" }),
  item("MB", "Mens Leather Belt", "male", "Man > Accessoarer > Bälten"),
  item("WJ", "Womens Gold Necklace Smycken", "female", "Kvinna > Accessoarer > Smycken"),
  item("WW", "Womens Classic Watch", "female", "Kvinna > Accessoarer > Klockor"),
  item("MSG", "Mens Sunglasses", "male", "Man > Accessoarer > Solglasögon"),
  item("WBAG", "Womens Leather Tote Bag", "female", "Kvinna > Väskor"),
  item("MU", "Mens Socks 5-pack", "male", "Man > Kläder > Underkläder > Strumpor"),
  item("MSW", "Mens Swim Shorts", "male", "Man > Kläder > Badkläder"),
  item("WSW", "Womens Bikini", "female", "Kvinna > Kläder > Badkläder"),
  item("ML", "Mens Flannel Pyjama Pant", "male", "Man > Kläder > Underkläder > Pyjamas"),
  item("WL", "Womens Cosy Cashmere Pant", "female", "Kvinna > Kläder > Underkläder & Loungewear"),
  item("MO", "Mens Paddy", "male", "Kampanjer > 2609 Medlemshelg 20%"),
];

const names = (list: Product[]) => list.map((p) => p.name).sort();
const feed = async (kind: "products" | "outfits", gender?: "men" | "women") =>
  names((await getFeedPage(db, { kind, gender, limit: 50 })).products);

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await importFromSource(db, memorySource(feedXml(CATALOG)), { logger: silentLogger });
});
afterAll(async () => {
  await close();
});

describe("Products feed eligibility", () => {
  it("Men: men's + unisex clothing only", async () => {
    expect(await feed("products", "men")).toEqual([
      "Mens Oxford Shirt",
      "Mens Wool Trousers",
      "Unisex College Sweatshirt",
    ]);
  });

  it("Women: women's + unisex clothing only", async () => {
    expect(await feed("products", "women")).toEqual([
      "Unisex College Sweatshirt",
      "Womens Linen Dress",
      "Womens Merino Cardigan",
    ]);
  });

  it("never mixes genders", async () => {
    expect((await feed("products", "men")).some((n) => n.startsWith("Womens"))).toBe(false);
    expect((await feed("products", "women")).some((n) => n.startsWith("Mens"))).toBe(false);
  });

  it("excludes shoes, bags, accessories (belts, jewellery, watches, sunglasses), underwear and unclassified items", async () => {
    const all = [...(await feed("products", "men")), ...(await feed("products", "women"))];
    for (const excluded of [
      "Mens Leather Sneaker",
      "Womens Suede Boots",
      "Hav. Top Senses",
      "Mens Leather Belt",
      "Womens Gold Necklace Smycken",
      "Womens Classic Watch",
      "Mens Sunglasses",
      "Womens Leather Tote Bag",
      "Mens Socks 5-pack",
      "Mens Swim Shorts",
      "Womens Bikini",
      "Mens Flannel Pyjama Pant",
      "Womens Cosy Cashmere Pant",
      "Mens Paddy",
    ]) {
      expect(all).not.toContain(excluded);
    }
  });
});

describe("Outfits eligibility", () => {
  it("Men: clothing + shoes, men's and unisex", async () => {
    expect(await feed("outfits", "men")).toEqual([
      "Hav. Top Senses",
      "Mens Leather Sneaker",
      "Mens Oxford Shirt",
      "Mens Wool Trousers",
      "Unisex College Sweatshirt",
    ]);
  });

  it("Women: clothing + shoes, women's and unisex — still no accessories or bags", async () => {
    expect(await feed("outfits", "women")).toEqual([
      "Hav. Top Senses",
      "Unisex College Sweatshirt",
      "Womens Linen Dress",
      "Womens Merino Cardigan",
      "Womens Suede Boots",
    ]);
  });

  it("outfit candidates for a slot respect the shopper gender", async () => {
    const shoes = await listProducts(db, { categories: ["shoes"], gender: "men", limit: 10 });
    expect(names(shoes)).toEqual(["Hav. Top Senses", "Mens Leather Sneaker"]);
  });
});

describe("shoes: outfit components, never standalone products", () => {
  const shoeNames = ["Mens Leather Sneaker", "Womens Suede Boots", "Hav. Top Senses"];

  it("never appear in the Products feed, for either gender", async () => {
    const all = [...(await feed("products", "men")), ...(await feed("products", "women"))];
    expect(all.filter((n) => shoeNames.includes(n))).toEqual([]);
  });

  it("never appear in Products search, even when searched for by name", async () => {
    for (const gender of ["men", "women"] as const) {
      for (const q of ["sneaker", "boots", "suede", "havaianas", "leather sneaker"]) {
        expect(await searchProducts(db, q, { limit: 20, gender })).toEqual([]);
      }
    }
  });

  it("can appear in Outfits (feed and slot candidates)", async () => {
    expect(await feed("outfits", "men")).toContain("Mens Leather Sneaker");
    expect(names(await listProducts(db, { categories: ["shoes"], gender: "women", limit: 10 }))).toContain(
      "Womens Suede Boots",
    );
  });

  it("men's shoes never reach women's outfits, and vice versa", async () => {
    const womensOutfitPieces = [
      ...(await feed("outfits", "women")),
      ...names(await listProducts(db, { categories: ["shoes"], gender: "women", limit: 10 })),
    ];
    const mensOutfitPieces = [
      ...(await feed("outfits", "men")),
      ...names(await listProducts(db, { categories: ["shoes"], gender: "men", limit: 10 })),
    ];
    expect(womensOutfitPieces).not.toContain("Mens Leather Sneaker");
    expect(mensOutfitPieces).not.toContain("Womens Suede Boots");
  });

  it("unisex shoes are available to both", async () => {
    for (const gender of ["men", "women"] as const) {
      expect(names(await listProducts(db, { categories: ["shoes"], gender, limit: 10 }))).toContain("Hav. Top Senses");
    }
  });

  it("outfit candidate lists can't be used to fetch non-outfit products", async () => {
    const list = await listProducts(db, {
      categories: ["accessories", "bags", "underwear", "swimwear", "loungewear", "other"],
      limit: 50,
    });
    expect(list).toEqual([]);
  });
});

describe("classification", () => {
  it("a single-category brand beats a misleading model name", async () => {
    const [havaianas] = await getFeedPage(db, { kind: "outfits", gender: "men", limit: 50 }).then((p) =>
      p.products.filter((x) => x.brand === "Havaianas"),
    );
    expect(havaianas).toMatchObject({ category: "shoes", productType: "shoes" });
  });
});

describe("Search and inspiration follow Products eligibility", () => {
  it("search respects gender and clothing-only", async () => {
    expect(names(await searchProducts(db, "leather", { limit: 20, gender: "men" }))).toEqual([]);
    expect(names(await searchProducts(db, "mens womens unisex", { limit: 20, gender: "women" }))).toEqual([
      "Unisex College Sweatshirt",
      "Womens Linen Dress",
      "Womens Merino Cardigan",
    ]);
  });

  it("inspiration only uses eligible clothing for the gender", async () => {
    const tiles = await getInspiration(db, "women");
    for (const t of tiles) {
      expect(t.product.productType).toBe("clothing");
      expect(t.product.gender).not.toBe("men");
    }
  });
});

describe("API parameters", () => {
  const req = (path: string) => new Request(`http://localhost${path}`);

  it("feed accepts for=products|outfits and gender=men|women", async () => {
    const res = await feedRoute(req("/api/feed?for=outfits&gender=women&limit=50"));
    const body = await res.json();
    expect(names(body.products)).toContain("Womens Suede Boots");
  });

  it("there is no unisex shopper option", async () => {
    expect((await feedRoute(req("/api/feed?gender=unisex"))).status).toBe(400);
    expect((await productsRoute(req("/api/products?gender=unisex"))).status).toBe(400);
  });

  it("feed defaults to the Products rules", async () => {
    const body = await (await feedRoute(req("/api/feed?gender=men&limit=50"))).json();
    expect(names(body.products)).toEqual(await feed("products", "men"));
  });
});

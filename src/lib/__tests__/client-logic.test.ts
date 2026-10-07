import { describe, expect, it } from "vitest";
import { composeOutfits } from "@/lib/outfit-feed";
import {
  alternativesFor,
  generateOutfit,
  outfitHref,
  outfitItemList,
  parseOutfitItems,
  roleFor,
} from "@/lib/outfits";
import { initialState, reducer } from "@/lib/store/style-profile-context";
import { migratePersistedState, STORAGE_KEY } from "@/lib/store/style-profile-migrate";
import type { Product } from "@/lib/types";

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const product = (p: Partial<Product>): Product => ({
  id: uuid(),
  brand: "Brand",
  name: "Piece",
  price: 1000,
  currency: "SEK",
  image: "https://www.johnells.se/pub_images/x.jpg",
  productType: "clothing",
  category: "shirts",
  colors: [],
  retailer: "Johnells",
  sizes: [],
  available: true,
  shopUrl: "/api/products/x/shop",
  tags: [],
  ...p,
});

describe("Build the Look on real products", () => {
  const coat = product({ category: "outerwear", gender: "men", tags: ["outerwear"] });
  const shirt = product({ category: "shirts", gender: "men" });
  const knit = product({ category: "knitwear", gender: "men", tags: ["neutral"] });
  const jeans = product({ category: "jeans", gender: "men" });
  const sneaker = product({ category: "shoes", gender: "unisex" });
  const dress = product({ category: "dresses", gender: "women" });
  const skirt = product({ category: "skirts", gender: "women" });
  const soldOut = product({ category: "trousers", gender: "men", available: false });
  const pool = [shirt, knit, jeans, sneaker, dress, skirt, soldOut];

  it("maps canonical categories onto outfit slots", () => {
    expect(roleFor(coat)).toBe("outerwear");
    expect(roleFor(jeans)).toBe("bottom");
    expect(roleFor(product({ category: "accessories" }))).toBeUndefined();
  });

  it("fills every slot with gender-compatible, available pieces", () => {
    const items = generateOutfit(coat, pool, { neutral: 2 });
    expect(items).toEqual({ outerwear: coat.id, top: knit.id, bottom: jeans.id, footwear: sneaker.id });
  });

  it("never mixes in pieces for another gender", () => {
    const items = generateOutfit(dress, pool, {});
    expect(items.bottom).toBe(skirt.id);
    expect(Object.values(items)).not.toContain(jeans.id);
  });

  it("returns no look for an anchor without a slot", () => {
    expect(generateOutfit(product({ category: "bags" }), pool, {})).toEqual({});
  });

  it("offers swap alternatives excluding pieces already in the look", () => {
    const items = generateOutfit(coat, pool, { neutral: 2 });
    expect(alternativesFor("top", items, coat, pool, {}).map((p) => p.id)).toEqual([shirt.id]);
  });

  it("resolves look pieces through a lookup, skipping unknown ids", () => {
    const byId = new Map([coat, knit].map((p) => [p.id, p]));
    const list = outfitItemList({ outerwear: coat.id, top: knit.id, bottom: "gone" }, (id) => byId.get(id));
    expect(list.map((i) => i.role)).toEqual(["outerwear", "top"]);
  });
});

describe("persisted style state migration (v2 mock ids → v3)", () => {
  const realId = "11111111-1111-4111-8111-111111111111";
  const v2 = {
    activeStyleId: "work",
    hasOnboarded: true,
    styleOrder: ["everyday", "work", "style-1"],
    styles: {
      work: {
        id: "work",
        name: "Work",
        description: "Tailored",
        seedAffinity: { tailoring: 3 },
        affinity: { tailoring: 2, black: 1 },
        liked: { "nn07-overshirt": true, [realId]: true },
        disliked: { "arket-coat": true },
        interactions: 4,
        feedOrder: ["nn07-overshirt", "arket-coat"],
        feedIndex: 1,
        showSwipeHint: false,
        createdAt: 1,
      },
    },
    savedOutfits: [
      { id: "look-1", anchorId: "arket-coat", items: { outerwear: "arket-coat" }, styleId: "work", createdAt: 1 },
      { id: "look-2", anchorId: realId, items: { top: realId }, styleId: "work", createdAt: 2 },
    ],
  };

  it("keeps every style and its learned taste", () => {
    const state = migratePersistedState(v2, "styleai:v2")!;
    expect(state.activeStyleId).toBe("work");
    expect(state.styleOrder).toEqual(["everyday", "work", "style-1"]);
    expect(state.styles!.work).toMatchObject({ name: "Work", affinity: { tailoring: 2, black: 1 }, interactions: 4 });
  });

  it("drops references to the removed mock products and resets the feed", () => {
    const work = migratePersistedState(v2, "styleai:v2")!.styles!.work;
    expect(work.liked).toEqual({ [realId]: true });
    expect(work.disliked).toEqual({});
    expect(work).toMatchObject({ feedOrder: [], feedIndex: 0, feedExhausted: false });
  });

  it("keeps only saved looks made of real products", () => {
    const state = migratePersistedState(v2, "styleai:v2")!;
    expect(state.savedOutfits!.map((o) => o.id)).toEqual(["look-2"]);
  });

  it("preserves a v3 feed position", () => {
    const v3 = { ...v2, styles: { work: { ...v2.styles.work, feedOrder: [realId], feedIndex: 1, feedExhausted: true } } };
    expect(migratePersistedState(v3, STORAGE_KEY)!.styles!.work).toMatchObject({
      feedOrder: [realId],
      feedIndex: 1,
      feedExhausted: true,
    });
  });

  it("gives every style empty, separate outfit feedback", () => {
    const work = migratePersistedState(v2, "styleai:v2")!.styles!.work;
    expect(work).toMatchObject({ outfitAffinity: {}, likedOutfits: 0, dislikedOutfits: 0, outfitCursor: undefined });
    expect(work.affinity).toEqual({ tailoring: 2, black: 1 });
  });

  it("rejects garbage", () => {
    expect(migratePersistedState("nope", STORAGE_KEY)).toBeNull();
    expect(migratePersistedState(null, STORAGE_KEY)).toBeNull();
  });
});

describe("Outfits feed composition", () => {
  const men = (category: Product["category"]) => product({ category, gender: "men" });
  const anchors = [men("shirts"), men("jeans"), men("outerwear"), product({ category: "bags", gender: "men" })];
  const pool = [
    ...Array.from({ length: 3 }, () => men("outerwear")),
    ...Array.from({ length: 3 }, () => men("knitwear")),
    ...Array.from({ length: 3 }, () => men("trousers")),
    ...Array.from({ length: 3 }, () => men("shoes")),
    product({ category: "skirts", gender: "women" }),
  ];

  it("builds one outfit per anchor that can start one", () => {
    const { outfits } = composeOutfits(anchors, pool, {});
    expect(outfits.map((o) => o.anchorId)).toEqual(anchors.slice(0, 3).map((a) => a.id));
    outfits.forEach((o) => expect(o.pieces.length).toBeGreaterThanOrEqual(3));
  });

  it("never mixes genders", () => {
    const { outfits } = composeOutfits(anchors, pool, {});
    const ids = outfits.flatMap((o) => o.pieces.map((p) => p.product.category));
    expect(ids).not.toContain("skirts");
  });

  it("varies pieces between consecutive outfits", () => {
    const { outfits } = composeOutfits([men("shirts"), men("shirts"), men("shirts")], pool, {});
    const shoes = outfits.map((o) => o.items.footwear);
    expect(new Set(shoes).size).toBe(3);
  });

  it("skips anchors when the pool can't fill enough slots", () => {
    expect(composeOutfits([men("shirts")], [men("shoes")], {}).outfits).toEqual([]);
  });
});

describe("outfit links", () => {
  it("round-trips the exact pieces through the URL", () => {
    const items = {
      outerwear: "11111111-1111-4111-8111-111111111111",
      top: "22222222-2222-4222-8222-222222222222",
    };
    const href = outfitHref(items.top, items);
    expect(href.startsWith(`/outfit/${items.top}?items=`)).toBe(true);
    expect(parseOutfitItems(new URL(href, "http://x").searchParams.get("items"))).toEqual(items);
  });

  it("ignores malformed items", () => {
    expect(parseOutfitItems("hat:123,top:not-an-id")).toBeUndefined();
    expect(parseOutfitItems(null)).toBeUndefined();
  });
});

describe("feed refresh", () => {
  it("drops a stale feed so it is fetched again from the start", () => {
    const base = initialState();
    const id = base.activeStyleId;
    const stale = {
      ...base,
      styles: {
        ...base.styles,
        [id]: { ...base.styles[id], feedOrder: ["a", "b", "c"], feedIndex: 2, feedExhausted: true, liked: { a: true as const } },
      },
    };
    const next = reducer(stale, { type: "refreshFeed" });
    expect(next.styles[id]).toMatchObject({ feedOrder: [], feedIndex: 0, feedExhausted: false });
    // Taste and saved items survive; only the queued feed is dropped.
    expect(next.styles[id].liked).toEqual({ a: true });
    const other = base.styleOrder.find((s) => s !== id)!;
    expect(next.styles[other]).toBe(stale.styles[other]);
  });
});

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
import { diffState, EMPTY_SYNCED, fromSynced, styleFields } from "@/lib/store/state-sync";
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

describe("server sync diff", () => {
  const p1 = "11111111-1111-4111-8111-111111111111";
  const p2 = "22222222-2222-4222-8222-222222222222";
  const fresh = () => ({ ...initialState(), hydrated: true });
  const shirt = product({ id: p1, tags: ["relaxed"] });

  it("uploads every style and the preferences for a new account", () => {
    const ops = diffState(EMPTY_SYNCED, fresh());
    expect(ops.filter((o) => o.op === "upsertStyle")).toHaveLength(Object.keys(fresh().styles).length);
    expect(ops.at(-1)).toMatchObject({ op: "prefs", hasOnboarded: false });
  });

  it("is empty when nothing changed, and ignores device-local feed positions", () => {
    const state = fresh();
    expect(diffState(state, state)).toEqual([]);
    expect(diffState(state, reducer(state, { type: "next" }))).toEqual([]);
  });

  it("sends a swipe as the style's new taste plus one reaction", () => {
    const before = fresh();
    const after = reducer(before, { type: "react", id: p1, tags: shirt.tags, direction: 1 });
    const ops = diffState(before, after);
    expect(ops).toEqual([
      expect.objectContaining({ op: "upsertStyle", style: expect.objectContaining({ affinity: { relaxed: 1 }, interactions: 1 }) }),
      { op: "react", styleId: before.activeStyleId, productId: p1, reaction: "like" },
    ]);
  });

  it("clears a reaction that was removed", () => {
    const liked = reducer(fresh(), { type: "toggleDetailLike", id: p1, tags: [] });
    const unliked = reducer(liked, { type: "toggleDetailLike", id: p1, tags: [] });
    expect(diffState(liked, unliked)).toContainEqual({
      op: "react",
      styleId: liked.activeStyleId,
      productId: p1,
      reaction: null,
    });
  });

  it("adds and removes saved outfits, and deletes styles last", () => {
    const base = reducer(fresh(), { type: "createStyle", name: "Mine", seedAffinity: {}, description: "" });
    const saved = reducer(base, { type: "saveOutfit", anchorId: p1, items: { top: p1, bottom: p2 } });
    const outfitId = saved.savedOutfits[0].id;
    expect(diffState(base, saved)).toEqual([{ op: "saveOutfit", outfit: saved.savedOutfits[0] }]);
    expect(diffState(saved, reducer(saved, { type: "removeOutfit", id: outfitId }))).toEqual([
      { op: "removeOutfit", outfitId },
    ]);

    const restarted = reducer(saved, { type: "restart" });
    const ops = diffState(saved, restarted);
    expect(ops.at(-1)).toEqual({ op: "deleteStyle", styleId: base.activeStyleId });
    expect(ops).toContainEqual({ op: "removeOutfit", outfitId });
  });

  it("round-trips through the server shape", () => {
    const state = reducer(fresh(), { type: "react", id: p1, tags: shirt.tags, direction: -1 });
    const server = {
      styles: state.styleOrder.map((id) => ({
        ...styleFields(state.styles[id]),
        liked: Object.keys(state.styles[id].liked),
        disliked: Object.keys(state.styles[id].disliked),
      })),
      activeStyleId: state.activeStyleId,
      hasOnboarded: state.hasOnboarded,
      savedOutfits: state.savedOutfits,
    };
    const restored = fromSynced(server);
    expect(diffState(state, restored)).toEqual([]);
    expect(restored.styles[state.activeStyleId].disliked).toEqual({ [p1]: true });
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

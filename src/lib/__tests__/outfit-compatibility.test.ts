import { describe, expect, it } from "vitest";
import { composeOutfits } from "@/lib/outfit-feed";
import { alternativesFor, compatibilityLevel, generateOutfit, outfitItemList } from "@/lib/outfits";
import type { Product, ProductEnrichment } from "@/lib/types";

let n = 0;
type Enrichment = Partial<ProductEnrichment> | null;

/** A men's product; `enrichment: null` means not enriched (legacy). */
function product(category: Product["category"], enrichment: Enrichment, extra: Partial<Product> = {}): Product {
  const id = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  return {
    id,
    brand: "Brand",
    name: `${category} ${n}`,
    price: 1000,
    currency: "SEK",
    image: "",
    images: [],
    productType: category === "shoes" ? "shoes" : "clothing",
    category,
    gender: "men",
    colors: [],
    retailer: "",
    sizes: [],
    available: true,
    shopUrl: "",
    tags: [],
    ...(enrichment
      ? {
          enrichment: {
            taxonomyVersion: "1.2.0",
            garmentType: "other",
            fit: "regular",
            colourPrimary: "navy",
            colourProfile: "neutral_dark",
            pattern: "solid",
            formality: 3,
            seasons: ["spring", "summer", "autumn", "winter"],
            aesthetics: [],
            ...enrichment,
          } as ProductEnrichment,
        }
      : {}),
    ...extra,
  };
}

/** Candidates later in the pool get a higher affinity score, so legacy ranking would pick them. */
const favoured = (p: Product): Product => ({ ...p, tags: ["neutral"] });
const affinity = { neutral: 5 };

describe("outfit compatibility with enrichment", () => {
  it("keeps shoes within one formality level of the outfit", () => {
    const blazer = product("blazers", { formality: 4 });
    const shirt = product("shirts", { formality: 4 });
    const trousers = product("trousers", { formality: 4 });
    const flipFlops = favoured(product("shoes", { formality: 1 }));
    const loafers = product("shoes", { formality: 4 });
    const items = generateOutfit(blazer, [shirt, trousers, flipFlops, loafers], affinity);
    expect(items.footwear).toBe(loafers.id);
  });

  it("allows smart-casual mixes but not jeans with a formal shirt", () => {
    const jeans = product("jeans", { formality: 2 });
    const formalShirt = favoured(product("shirts", { formality: 5 }));
    const casualShirt = product("shirts", { formality: 3 });
    const blazer = product("blazers", { formality: 4 });
    const items = generateOutfit(jeans, [formalShirt, casualShirt, blazer], affinity);
    expect(items.top).toBe(casualShirt.id);
    expect(items.outerwear).toBe(blazer.id); // span 2..4 is fine
  });

  it("needs at least one shared season", () => {
    const linenShirt = product("shirts", { seasons: ["summer"] });
    const winterCoat = favoured(product("outerwear", { seasons: ["winter"] }));
    const lightJacket = product("outerwear", { seasons: ["spring", "summer"] });
    expect(generateOutfit(linenShirt, [winterCoat, lightJacket], affinity).outerwear).toBe(lightJacket.id);
  });

  it("allows only one patterned piece", () => {
    const stripedShirt = product("shirts", { pattern: "stripe" });
    const checkTrousers = favoured(product("trousers", { pattern: "check" }));
    const plainTrousers = product("trousers", { pattern: "solid" });
    const cord = product("trousers", { pattern: "texture" });
    expect(generateOutfit(stripedShirt, [checkTrousers, plainTrousers], affinity).bottom).toBe(plainTrousers.id);
    expect(compatibilityLevel(cord, [stripedShirt])).toBe(0); // texture combines with anything
  });

  it("still completes the look when nothing is fully compatible, preferring the closest match", () => {
    const shirt = product("shirts", { pattern: "print", seasons: ["summer"], formality: 3 });
    const onlyTrousers = product("trousers", { pattern: "check", seasons: ["winter"], formality: 3 });
    const onlyShoes = product("shoes", { formality: 1 });
    const onlyCoat = product("outerwear", { formality: 3, seasons: ["winter"] });
    const items = generateOutfit(shirt, [onlyTrousers, onlyShoes, onlyCoat], {});
    expect(items).toEqual({ top: shirt.id, bottom: onlyTrousers.id, outerwear: onlyCoat.id, footwear: onlyShoes.id });
    expect(compatibilityLevel(onlyTrousers, [shirt])).toBe(2); // pattern and season relaxed, formality kept
    expect(compatibilityLevel(onlyShoes, [shirt, onlyTrousers])).toBe(3); // only the legacy match
  });

  it("ranks swap alternatives by fit with the rest of the look", () => {
    const shirt = product("shirts", { formality: 4 });
    const trousers = product("trousers", { formality: 4 });
    const sneakers = favoured(product("shoes", { formality: 1 }));
    const derbies = product("shoes", { formality: 4 });
    const boots = product("shoes", { formality: 3 });
    const items = { top: shirt.id, bottom: trousers.id, footwear: derbies.id };
    const pool = [trousers, sneakers, derbies, boots];
    const lookup = (id: string) => [shirt, ...pool].find((p) => p.id === id);
    // Boots fit; sneakers clash on formality, so they come in a later, fallback batch.
    const first = alternativesFor("footwear", items, shirt, pool, affinity, { lookup });
    expect(first).toEqual({ products: [boots], suitable: true, more: true });
    const next = alternativesFor("footwear", items, shirt, pool, affinity, { lookup, seen: [boots.id] });
    expect(next).toEqual({ products: [sneakers], suitable: false, more: false });
  });
});

describe("fallback without enrichment", () => {
  it("ranks by style affinity exactly as before", () => {
    const coat = product("outerwear", null);
    const plain = product("trousers", null);
    const liked = favoured(product("trousers", null));
    expect(generateOutfit(coat, [plain, liked], affinity).bottom).toBe(liked.id);
  });

  it("treats a missing enrichment on either side as compatible", () => {
    const formal = product("blazers", { formality: 5 });
    const unknownShoes = favoured(product("shoes", null));
    const casualShoes = product("shoes", { formality: 1 });
    expect(compatibilityLevel(unknownShoes, [formal])).toBe(0);
    expect(compatibilityLevel(casualShoes, [product("shirts", null)])).toBe(0);
    expect(generateOutfit(formal, [unknownShoes, casualShoes], affinity).footwear).toBe(unknownShoes.id);
  });
});

describe("feed composition with enrichment", () => {
  it("builds complete, compatible outfits from a small enriched catalogue", () => {
    const tops = [2, 3, 4].map((f) => product("shirts", { formality: f as 2 | 3 | 4 }));
    const bottoms = [2, 3, 4].map((f) => product("trousers", { formality: f as 2 | 3 | 4 }));
    const coats = [2, 3, 4].map((f) => product("outerwear", { formality: f as 2 | 3 | 4 }));
    const shoes = [2, 3, 4].map((f) => product("shoes", { formality: f as 2 | 3 | 4 }));
    const pool = [...tops, ...bottoms, ...coats, ...shoes];
    const { outfits } = composeOutfits(tops, pool, {});
    expect(outfits).toHaveLength(3);
    for (const o of outfits) {
      expect(o.pieces).toHaveLength(4);
      const pieces = o.pieces.map((p) => p.product);
      for (const p of pieces) expect(compatibilityLevel(p, pieces.filter((q) => q !== p))).toBeLessThan(3);
    }
  });
});

describe("swap", () => {
  const lookupIn = (...products: Product[]) => (id: string) => products.find((p) => p.id === id);
  const ids = (products: Product[]) => products.map((p) => p.id);

  it("offers alternatives for the anchor's own slot, and the outfit still renders once it's replaced", () => {
    const anchor = product("shirts", { formality: 3 });
    const trousers = product("trousers", { formality: 3 });
    const otherShirt = product("shirts", { formality: 3 });
    const items = { top: anchor.id, bottom: trousers.id };
    const lookup = lookupIn(anchor, trousers, otherShirt);
    const batch = alternativesFor("top", items, anchor, [anchor, trousers, otherShirt], {}, { lookup });
    expect(ids(batch.products)).toEqual([otherShirt.id]);

    const swapped = { ...items, top: otherShirt.id };
    expect(outfitItemList(swapped, lookup).map((i) => i.product.id)).toEqual([otherShirt.id, trousers.id]);
  });

  it("judges candidates against every remaining piece, even ones not in the pool", () => {
    const blazer = product("blazers", { formality: 4 });
    const shirt = product("shirts", { formality: 4 }); // in the outfit, not in the pool
    const loafers = product("shoes", { formality: 4 });
    const flipFlops = favoured(product("shoes", { formality: 1 }));
    const items = { outerwear: blazer.id, top: shirt.id, footwear: loafers.id };
    const pool = [flipFlops, product("shoes", { formality: 4 })];
    const batch = alternativesFor("footwear", items, blazer, pool, affinity, { lookup: lookupIn(blazer, shirt, loafers) });
    expect(batch.products).toEqual([pool[1]]);
    expect(batch.suitable).toBe(true);
  });

  it("returns only the slot's role, never a piece already in the outfit, a sold-out piece or another gender", () => {
    const anchor = product("shirts", null);
    const jeans = product("jeans", null);
    const shoes = product("shoes", null);
    const items = { top: anchor.id, bottom: jeans.id, footwear: shoes.id };
    const otherJeans = product("jeans", null);
    const skirt = product("skirts", null, { gender: "women" });
    const soldOut = product("trousers", null, { available: false });
    const pool = [anchor, jeans, shoes, otherJeans, skirt, soldOut, product("shirts", null), product("outerwear", null)];
    const batch = alternativesFor("bottom", items, anchor, pool, {}, { lookup: lookupIn(...pool) });
    expect(ids(batch.products)).toEqual([otherJeans.id]);
    expect(batch.more).toBe(false);
  });

  it("keeps to the remaining pieces' gender when the anchor is unisex", () => {
    const anchor = product("shoes", null, { gender: "unisex" });
    const mensShirt = product("shirts", null);
    const womensSkirt = product("skirts", null, { gender: "women" });
    const unisexTrousers = product("trousers", null, { gender: "unisex" });
    const items = { footwear: anchor.id, top: mensShirt.id };
    const pool = [womensSkirt, unisexTrousers];
    const batch = alternativesFor("bottom", items, anchor, pool, {}, { lookup: lookupIn(anchor, mensShirt) });
    expect(ids(batch.products)).toEqual([unisexTrousers.id]);
  });

  it("pages through non-overlapping batches of three until the candidates run out", () => {
    const shirt = product("shirts", { formality: 3 });
    const current = product("shoes", { formality: 3 });
    const shoes = Array.from({ length: 7 }, () => product("shoes", { formality: 3 }));
    const items = { top: shirt.id, footwear: current.id };
    const lookup = lookupIn(shirt, current);
    const pool = [current, ...shoes];
    const seen: string[] = [];
    const next = () => {
      const batch = alternativesFor("footwear", items, shirt, pool, {}, { lookup, seen });
      seen.push(...ids(batch.products));
      return batch;
    };

    const first = next();
    expect(first.products).toHaveLength(3);
    expect(first.more).toBe(true);
    const second = next();
    expect(second.products).toHaveLength(3);
    expect(ids(second.products).some((id) => ids(first.products).includes(id))).toBe(false);
    const third = next();
    expect(third).toMatchObject({ more: false });
    expect(third.products).toHaveLength(1);
    expect(new Set(seen)).toEqual(new Set(ids(shoes)));
    expect(next()).toEqual({ products: [], suitable: false, more: false });
  });

  it("doesn't bring back a piece that was just swapped out", () => {
    const shirt = product("shirts", null);
    const old = product("shoes", null);
    const picked = product("shoes", null);
    const other = product("shoes", null);
    const items = { top: shirt.id, footwear: picked.id };
    const batch = alternativesFor("footwear", items, shirt, [old, picked, other], {}, {
      lookup: lookupIn(shirt, picked),
      seen: [old.id],
    });
    expect(ids(batch.products)).toEqual([other.id]);
  });

  it("ranks by the active style's affinity among equally compatible pieces", () => {
    const shirt = product("shirts", { formality: 3 });
    const plain = product("trousers", { formality: 3 });
    const liked = favoured(product("trousers", { formality: 3 }));
    const items = { top: shirt.id };
    const lookup = lookupIn(shirt);
    expect(ids(alternativesFor("bottom", items, shirt, [plain, liked], affinity, { lookup }).products)).toEqual([liked.id, plain.id]);
    expect(ids(alternativesFor("bottom", items, shirt, [plain, liked], {}, { lookup }).products)).toEqual([plain.id, liked.id]);
  });

  it("never lets affinity lift a clashing piece into the good matches", () => {
    const shirt = product("shirts", { formality: 4 });
    const fitting = product("trousers", { formality: 4 });
    const clashing = favoured(product("trousers", { formality: 1 }));
    const batch = alternativesFor("bottom", { top: shirt.id }, shirt, [clashing, fitting], { neutral: 100 }, { lookup: lookupIn(shirt) });
    expect(batch).toEqual({ products: [fitting], suitable: true, more: true });
  });

  it("avoids disliked pieces while better ones remain, then falls back to them", () => {
    const shirt = product("shirts", { formality: 4 });
    const disliked = favoured(product("trousers", { formality: 4 }));
    const clashing = product("trousers", { formality: 1 });
    const fitting = product("trousers", { formality: 4 });
    const pool = [disliked, clashing, fitting];
    const options = { lookup: lookupIn(shirt), disliked: { [disliked.id]: true as const } };
    const first = alternativesFor("bottom", { top: shirt.id }, shirt, pool, affinity, options);
    expect(first).toEqual({ products: [fitting], suitable: true, more: true });
    // Fallbacks: a clashing piece before a disliked one.
    const rest = alternativesFor("bottom", { top: shirt.id }, shirt, pool, affinity, { ...options, seen: [fitting.id] });
    expect(rest).toEqual({ products: [clashing, disliked], suitable: false, more: false });
  });

  it("offers a disliked piece when it's the only one left", () => {
    const shirt = product("shirts", null);
    const onlyOne = product("trousers", null);
    const batch = alternativesFor("bottom", { top: shirt.id }, shirt, [onlyOne], {}, {
      lookup: lookupIn(shirt),
      disliked: { [onlyOne.id]: true },
    });
    expect(batch).toEqual({ products: [onlyOne], suitable: false, more: false });
  });
});

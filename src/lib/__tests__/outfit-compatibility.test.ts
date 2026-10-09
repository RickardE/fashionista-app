import { describe, expect, it } from "vitest";
import { composeOutfits } from "@/lib/outfit-feed";
import { alternativesFor, compatibilityLevel, generateOutfit } from "@/lib/outfits";
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
    expect(alternativesFor("footwear", items, shirt, [trousers, sneakers, derbies, boots], affinity).map((p) => p.id)).toEqual([boots.id, sneakers.id]);
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

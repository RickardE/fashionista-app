import { describe, expect, it } from "vitest";
import { groupVariants } from "../grouping";
import { resolveMapping } from "../mapping/profile";
import { descriptionLead, mapColor, normalizeRawProduct, resolveCategory } from "../normalize";
import { JOHNELLS_MAPPING } from "../sources/adtraction/johnells";
import { FeedParseError, parseGoogleShoppingFeed, parseMoney } from "../sources/google-shopping-xml";
import type { RawProduct } from "../types";
import { FULL_FEED, SHIRT_ROWS, feedXml } from "./fixtures/feed";

const mapping = resolveMapping(JOHNELLS_MAPPING);

function parseOk(xml: string): RawProduct[] {
  return parseGoogleShoppingFeed(xml, { defaultCurrency: "SEK" }).flatMap((r) => (r.ok ? [r.product] : []));
}

describe("feed parsing", () => {
  it("parses g:-prefixed Google Shopping items into raw products", () => {
    const rows = parseOk(feedXml(SHIRT_ROWS));
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.externalId)).toEqual(["LIN-100-S", "LIN-100-M", "LIN-100-L"]);
    const first = rows[0];
    expect(first.externalGroupId).toBe("LIN-100");
    expect(first.size).toBe("S");
    expect(first.color).toBe("Svart");
    expect(first.gtin).toBe("0731000000011"); // leading zero preserved
    expect(first.categoryPaths).toHaveLength(2);
    expect(first.price).toEqual({ amountMinor: 129900, currency: "SEK" });
    expect(first.salePrice).toEqual({ amountMinor: 99900, currency: "SEK" });
    expect(first.raw).toHaveProperty("item_group_id", "LIN-100");
  });

  it("reports invalid rows without failing the feed", () => {
    const results = parseGoogleShoppingFeed(FULL_FEED);
    const invalid = results.filter((r) => !r.ok);
    expect(invalid).toHaveLength(2);
    expect(invalid.map((r) => !r.ok && r.reason)).toEqual(["missing id", "missing title"]);
    expect(results.filter((r) => r.ok)).toHaveLength(6);
  });

  it("rejects malformed XML with a FeedParseError", () => {
    expect(() => parseGoogleShoppingFeed("<rss><channel><item><g:id>1</item>")).toThrow(FeedParseError);
    expect(() => parseGoogleShoppingFeed("<html><body>Not found</body></html>")).toThrow(FeedParseError);
  });

  it.each([
    ["1299.00 SEK", 129900, "SEK"],
    ["1 299,00 SEK", 129900, "SEK"],
    ["22999 SEK", 2299900, "SEK"],
    ["SEK 149", 14900, "SEK"],
    ["1,299.50 EUR", 129950, "EUR"],
  ])("parses money %s", (input, amountMinor, currency) => {
    expect(parseMoney(input)).toEqual({ amountMinor, currency });
  });

  it("returns undefined for unparseable money", () => {
    expect(parseMoney("free")).toBeUndefined();
    expect(parseMoney("")).toBeUndefined();
  });
});

describe("mapping", () => {
  it.each([
    ["Svart", "black"],
    ["Black", "black"],
    ["  BLACK ", "black"],
    ["Vit", "white"],
    ["White", "white"],
    ["Blå", "blue"],
    ["Blue", "blue"],
    ["Marinblå", "navy"],
    ["Brun", "brown"],
    ["Green", "green"],
    ["Beige", "beige"],
    ["Svart/Vit", "black"],
    ["Mörkblå", "navy"],
    ["Light Blue", "blue"],
    ["Offwhite", "off-white"],
    ["Creme", "off-white"],
    ["Greige", "beige"],
    ["Military", "olive"],
    ["Chocolate Brown", "brown"],
    ["Bordeaux", "burgundy"],
  ])("maps colour %s → %s", (input, expected) => {
    expect(mapColor(input, mapping)).toBe(expected);
  });

  it("leaves unknown colours undefined rather than guessing", () => {
    expect(mapColor("Moonbeam", mapping)).toBeUndefined();
  });

  it("lets a source profile override base dictionaries", () => {
    const custom = resolveMapping({ colors: { Moonbeam: "silver" } });
    expect(mapColor("moonbeam", custom)).toBe("silver");
    expect(mapColor("Svart", custom)).toBe("black");
  });

  it("uses the deepest meaningful category segment", () => {
    expect(
      resolveCategory({ categoryPaths: ["Man > Kläder > Skjortor > Linneskjortor"], title: "x" }, mapping),
    ).toMatchObject({ category: "shirts", subcategory: "linen shirt" });
  });

  it("ignores internal campaign category trees and falls back to the title", () => {
    expect(
      resolveCategory(
        { categoryPaths: ["Kampanjer > interna kategorier > Skjortor 30%"], title: "Wool Trousers" },
        mapping,
      ),
    ).toMatchObject({ category: "trousers", source: "title" });
  });

  // Regression cases taken from the real Johnells feed.
  it.each([
    // [title, category path, description, brand, expected]
    ["Pima t-shirt", "Kampanjer  >  2511 25% Black Friday Weekend Allmän", "", "Polo Ralph Lauren", "t-shirts"],
    ["Half Zip Sweatshirt", "Man  >  Varumärken  >  Polo Ralph Lauren", "", "Polo Ralph Lauren", "sweatshirts"],
    ["Ferry Patch Soft Blazer", "Man  >  Varumärken  >  Polo Ralph Lauren", "", "Oscar Jacobson", "blazers"],
    ["Ellington", "Man  >  Kläder  >  Skjortor  >  Businesskjortor", "", "1797", "shirts"],
    ["Hartsfield", "Man  >  Kläder  >  Jackor  >  Höstjackor", "", "Moose Knuckles", "outerwear"],
    ["Lou", "Kvinna  >  Kläder  >  Kjolar  >  Jeanskjolar", "", "Neuw", "skirts"],
    ["T-shirt rn 3p classic", "Man  >  Varumärken  >  BOSS Black  >  BOSS BLACK  >  Tröjor", "", "BOSS", "t-shirts"],
    ["Cashmere Coat W", "Kampanjer  >  2609 Medlemshelg 20%", "", "Sand", "outerwear"],
    ["Knit Shorts", "Kampanjer  >  2608 50% Johnellsale fas5", "", "x", "shorts"],
    ["Merino Dress", "Kvinna  >  Kläder  >  Klänningar  >  Stickade klänningar", "", "x", "dresses"],
    ["Wool jersey jacket", "Kampanjer  >  2609 Medlemshelg 20%", "", "Morris", "outerwear"],
    ["Shell Wide Belt", "Kampanjer  >  2609 Medlemshelg 20%", "", "Rodebjer", "accessories"],
    ["Spray down vest", "Kampanjer  >  2511 30% på utvalda ytterplagg", "", "Sail Racing", "outerwear"],
    ["Theo", "Kampanjer  >  2609 Medlemshelg 20%", "■ Modellen är 186 cm och bär storlek 32/32 ■ Slim fit tailored Svarta chinos från NN07. Byxorna har avsmalnande ben.", "NN07", "trousers"],
    ["Classic 3-pack trunk", "Kampanjer  >  2511 25% Black Friday Weekend Allmän", "Svarta kalsonger från Polo Ralph Lauren.", "Polo Ralph Lauren", "underwear"],
    ["Womens Leather Tote", "Kvinna  >  Väskor  >  Axelremsväskor", "", "x", "bags"],
    ["Mini Shopper", "Kvinna  >  Accessoarer  >  Väskor", "", "x", "bags"],
    ["Hav. Top Senses", "Kampanjer  >  2609 Medlemshelg 20%", "", "Havaianas", "shoes"],
    ["Swim Shorts", "Kampanjer  >  2609 Medlemshelg 20%", "", "x", "swimwear"],
    ["Traveler swim trunk", "Kampanjer  >  2511 25% Black Friday Weekend Allmän", "", "Polo Ralph Lauren", "swimwear"],
    ["Pj pant", "Kampanjer  >  2511 25% Black Friday Weekend Allmän", "■ Regular fit ■ Ljusblåa pyjamasbyxor med mikrorutigt mönster.", "Polo Ralph Lauren", "loungewear"],
    ["Easy Long Set TShirt", "Man  >  Varumärken  >  BOSS Black  >  BOSS BLACK", "Pyjamas från BOSS Black. T-shirt och byxor i regular fit.", "BOSS Black", "loungewear"],
    ["Velvetfish", "Man  >  Varumärken  >  BOSS Black  >  BOSS BLACK  >  Accessoarer", "Randiga badbyxor från Boss Black.", "BOSS Black", "swimwear"],
    ["Landon Pant Robertson", "Kampanjer  >  2609 Medlemshelg 20%", "Landon Pant är tillverkad i ett kraftigt jeanstyg.", "Carhartt WIP", "trousers"],
    ["2p rs uni cc", "Kampanjer  >  2511 25% Black Friday Weekend Allmän", "2-pack mörkblåa strumpor från BOSS Black.", "BOSS", "underwear"],
  ])("categorizes %s", (title, path, description, brand, expected) => {
    expect(resolveCategory({ categoryPaths: [path], title, description, brand }, mapping).category).toBe(expected);
  });

  it("strips a source's fit-note markers from the description lead", () => {
    expect(descriptionLead("■ Modellen är 186 cm ■ Svarta chinos från NN07. Byxorna har fickor. Tredje.")).toBe(
      "Svarta chinos från NN07. Byxorna har fickor.",
    );
  });

  it("normalizes a raw row into STYLEAI vocabulary", () => {
    const [raw] = parseOk(feedXml(SHIRT_ROWS));
    const n = normalizeRawProduct(raw, mapping);
    expect(n).toMatchObject({
      groupKey: "LIN-100",
      category: "shirts",
      color: "black",
      colorRaw: "Svart",
      gender: "men",
      availability: "in_stock",
      condition: "new",
      description: "Avslappnad skjorta i 100% linne .",
    });
  });
});

describe("variant grouping", () => {
  it("collapses 3 size rows into 1 product with 3 variants", () => {
    const rows = parseOk(feedXml(SHIRT_ROWS)).map((r) => normalizeRawProduct(r, mapping));
    const { products } = groupVariants(rows, "Johnells");
    expect(products).toHaveLength(1);
    const [product] = products;
    expect(product.name).toBe("Linneskjorta Relaxed");
    expect(product.colors).toEqual(["black"]);
    expect(product.offer.externalGroupKey).toBe("LIN-100");
    expect(product.offer.variants.map((v) => v.size)).toEqual(["S", "M", "L"]);
    expect(product.offer.variants.map((v) => v.gtin)).toEqual([
      "0731000000011",
      "0731000000028",
      "0731000000035",
    ]);
    expect(product.offer.salePrice?.amountMinor).toBe(99900);
  });

  it("drops duplicate variant rows (same external id)", () => {
    const rows = parseOk(feedXml([...SHIRT_ROWS, SHIRT_ROWS[0]])).map((r) => normalizeRawProduct(r, mapping));
    const { products, duplicateVariants } = groupVariants(rows, "Johnells");
    expect(duplicateVariants).toBe(1);
    expect(products[0].offer.variants).toHaveLength(3);
  });

  it("treats rows without a group id as single-variant products", () => {
    const rows = parseOk(feedXml([{ id: "SOLO-1", title: "Leather Belt", size: "90" }])).map((r) =>
      normalizeRawProduct(r, mapping),
    );
    const { products } = groupVariants(rows, "Johnells");
    expect(products).toHaveLength(1);
    expect(products[0].offer.externalGroupKey).toBe("SOLO-1");
    expect(products[0].category).toBe("accessories");
  });
});

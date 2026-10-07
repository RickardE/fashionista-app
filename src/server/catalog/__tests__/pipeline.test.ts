import { describe, expect, it } from "vitest";
import { groupVariants } from "../grouping";
import { resolveMapping } from "../mapping/profile";
import { mapColor, normalizeRawProduct, resolveCategory } from "../normalize";
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

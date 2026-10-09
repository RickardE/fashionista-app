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
    // "Boot" in a title is also a jeans style name; the description decides then.
    ["Kara boot prudence", "Kampanjer  >  2511 25% Black Friday Weekend Allmän", "■ Slim, bootcut Mörkblå jeans från Neuw. Jeansen är en femficksmodell med bälteshällor.", "Neuw", "jeans"],
    ["Bidford Chelsea Boot", "Kampanjer  >  2609 Medlemshelg 20%", "Bruna Chelsea boots från GANT. Bidford Chelsea Boot har en klassisk siluett.", "Gant Footwear", "shoes"],
    ["Tall Boot", "Kampanjer  >  interna kategorier  >  Temp", "Beigea gummistövlar från Hunter i modellen Women's Original Tall Wellington Boots.", "Hunter", "shoes"],
    ["Classic Boot", "Kampanjer  >  interna kategorier  >  berikning2509", "■ Skorna är lite små i storleken. Svarta, varmfodrade skor från Inuikii.", "Inuikii", "shoes"],
    // A boot whose description mentions what to wear it with stays a boot.
    ["Ankle Boot", "Kampanjer  >  Temp", "Snygg boot att bära till jeans. Läder och gummisula.", "Example", "shoes"],
    // "Pullover" is a shape: the description decides what kind.
    ["Knit Pullover", "Kvinna  >  Varumärken  >  Lauren Ralph Lauren", "Kortärmad top från Lauren Ralph Lauren med brodyr på ärmarna.", "Lauren Ralph Lauren", "tops"],
    ["Knit Pullover Sweatshirt", "Kvinna  >  Varumärken  >  Polo Ralph Lauren", "Vit hoodie med tryck från Polo Ralph Lauren. Tillverkad av mjuk fransk frotté.", "Polo Ralph Lauren", "sweatshirts"],
    ["Knit Pullover", "Man  >  Kläder  >  Skjortor  >  Kortärmade skjortor", "Vit kortärmadskjorta från Polo Ralph Lauren, tillverkad i linne och bomull.", "Polo Ralph Lauren", "shirts"],
    ["Cable Pullover", "Kampanjer  >  Temp", "Kabelstickad tröja i ull. Stickad tröja med rund hals.", "Example", "knitwear"],
    ["Merino Pullover", "Kampanjer  >  Temp", "", "Example", "knitwear"],
    // "Half-Zip" paths hold knits and sweatshirts: a description naming a sweatshirt decides.
    ["Hartsfield zip", "Man  >  Kläder  >  Hoodies & Tröjor  >  Half-Zip", "Brun sweatshirt från Moose Knuckles i modellen Hartsfield. En premium sweatshirt i mjuk bomull med modern halvzip-design.", "Moose Knuckles", "sweatshirts"],
    ["Hartsfield zip", "Man  >  Kläder  >  Hoodies & Tröjor  >  Half-Zip", "Beige stickad tröja från Moose Knuckles. Hartsfield 1/4 Zip har en regular fit med hög ribbad krage.", "Moose Knuckles.", "knitwear"],
    // …but a title's collar or model name does not ("HZ Polo" is a knit with a polo collar).
    ["Kang 1/2 Zip Polo", "Man  >  Kläder  >  Hoodies & Tröjor  >  Half-Zip", "Grå half-zip tröja från Woodbird. Kang 1/2 Zip Polo har en klassisk polokrage.", "WOODBIRD", "knitwear"],
    ["Half Zip Knit", "Man  >  Kläder  >  Hoodies & Tröjor  >  Half-Zip", "Brun hal-zip tröja från Polo Ralph Lauren.", "Polo Ralph Lauren", "knitwear"],
    ["Jack Half Zip Sweater", "Man  >  Kläder  >  Hoodies & Tröjor  >  Half-Zip", "Produktbeskrivning kommer snart", "1797", "knitwear"],
    // A bare "Hood" is a feature as well as a hoodie; the description decides,
    // ignoring its own repetition of the product name.
    ["Frost Down Hood Jacket", "Man  >  Varumärken  >  Peak Performance", "Lätt och packbar dunjacka för låg- till medelintensiva aktiviteter.", "Peak Performance", "outerwear"],
    ["Spray Down Hood", "Kampanjer  >  2511 25% Black Friday Weekend Allmän", "Spray Down Hood är en lättviktsdunjacka konstruerad i nylon.", "Sail Racing", "outerwear"],
    ["W Spray Polartec Hood", "Kampanjer  >  2606 30% Johnellsale start", "Women’s Spray Polartec Hood från Sail Racing är en varm och flexibel fleecejacka.", "Sail Racing", "outerwear"],
    ["Varek Hybrid Zip Hood", "Kampanjer  >  Temp", "Varek Hybrid Zip Hood från J.Lindeberg är en varm och funktionell hybridhoodie.", "J Lindeberg", "sweatshirts"],
    ["Bowman zip hood", "Kampanjer  >  Temp", "", "Sail Racing", "sweatshirts"],
    ["Alpha Hood", "Man  >  Kläder  >  Hoodies & Tröjor  >  Hoodies", "", "J Lindeberg", "sweatshirts"],
    ["Helium down hybrid hood", "Man  >  Varumärken  >  Peak Performance", "Vår lättaste och mest packbara dunvaddering tillsammans med stretchig fleece.", "Peak Performance", "sweatshirts"],
    // Mittens, gloves and jewellery are accessories, whatever garments their descriptions mention.
    ["Mitten Acrylic", "Kampanjer  >  2609 Medlemshelg 20%", "Carhartt Mitten från Carhartt WIP är en varm och bekväm vante i stretchigt, sju gauge-stickat akrylgarn.", "Carhartt WIP", "accessories"],
    ["Pixie Brooch Gold Plated", "Kampanjer  >  2609 Medlemshelg 20%", "Guldfärgad brosch från Twist & Tango. En dekorativ accessoar som enkelt lyfter jackor, halsdukar och blusar.", "Twist&Tango", "accessories"],
    ["Broche", "Kvinna  >  Varumärken  >  By Malene Birger", "Brosch från By Malene Birger. Broche-broschen har en skulptural design.", "By Malene Birger", "accessories"],
    ["Deanna Glove", "Kampanjer  >  Temp", "", "Barbour", "accessories"],
    // …but knits and blouses stay what they are.
    ["Wool Cardigan", "Kampanjer  >  Temp", "Stickad kofta i ull med pärlemorknappar.", "Example", "knitwear"],
    ["Lambswool Crew", "Kampanjer  >  Temp", "Stickad tröja i lammull. Matcha med vantar och mössa.", "Example", "knitwear"],
    ["Silk Blouse", "Kampanjer  >  Temp", "Blus i siden med broschdetalj vid halsen.", "Example", "shirts"],
  ])("categorizes %s", (title, path, description, brand, expected) => {
    expect(resolveCategory({ categoryPaths: [path], title, description, brand }, mapping).category).toBe(expected);
  });

  it("keeps a Half-Zip path's subcategory when the description doesn't contradict it", () => {
    const halfZip = "Man  >  Kläder  >  Hoodies & Tröjor  >  Half-Zip";
    expect(
      resolveCategory({ categoryPaths: [halfZip], title: "Merino john zip", description: "Finstickad tröja från Morris. Tröjan har en hög krage med half zip." }, mapping),
    ).toMatchObject({ category: "knitwear", subcategory: "half-zip", source: halfZip });
    expect(
      resolveCategory({ categoryPaths: [halfZip], title: "Hartsfield zip", description: "Svart sweatshirt i mjuk bomull." }, mapping),
    ).toMatchObject({ category: "sweatshirts", source: "description" });
  });

  it("gives gloves and jewellery their subcategory", () => {
    expect(resolveCategory({ categoryPaths: [], title: "Mitten Acrylic" }, mapping)).toMatchObject({ category: "accessories", subcategory: "gloves" });
    expect(resolveCategory({ categoryPaths: [], title: "Pixie Brooch Gold Plated" }, mapping)).toMatchObject({ category: "accessories", subcategory: "jewellery" });
    expect(resolveCategory({ categoryPaths: [], title: "Frost Down Hood Jacket", description: "Lätt och packbar dunjacka." }, mapping)).toMatchObject({ category: "outerwear", subcategory: "down jacket" });
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

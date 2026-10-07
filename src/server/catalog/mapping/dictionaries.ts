/**
 * Shared, source-independent vocabulary (Swedish + English). Source mapping
 * profiles extend or override these; nothing here is merchant-specific.
 * Keys are matched after `normalizeKey` (lower-case, accents kept, trimmed).
 */

import type { Availability, CanonicalColor, Category, Condition, Gender } from "../types";

export const BASE_COLORS: Record<string, CanonicalColor> = {
  // black
  black: "black", svart: "black", "jet black": "black",
  // white
  white: "white", vit: "white", "optic white": "white", "bright white": "white",
  // off-white
  "off-white": "off-white", "off white": "off-white", offwhite: "off-white", ecru: "off-white",
  cream: "off-white", creme: "off-white", crème: "off-white", kräm: "off-white", krämvit: "off-white",
  "kräm vit": "off-white", ivory: "off-white", benvit: "off-white", naturvit: "off-white",
  "egg white": "off-white", "snow white": "off-white",
  // grey
  grey: "grey", gray: "grey", grå: "grey", "light grey": "grey", "dark grey": "grey", ljusgrå: "grey",
  mörkgrå: "grey", charcoal: "grey", antracit: "grey", anthracite: "grey", "grey melange": "grey",
  gråmelerad: "grey", "gray mottled": "grey", "grey mottled": "grey", "mid grey": "grey", "medium grey": "grey", silvergrå: "grey",
  // beige
  beige: "beige", sand: "beige", khaki: "beige", stone: "beige", taupe: "beige", camel: "beige",
  oat: "beige", natur: "beige", natural: "beige", greige: "beige", "light beige": "beige",
  ljusbeige: "beige", "dark beige": "beige", mörkbeige: "beige", kamel: "beige", nougat: "beige", champagne: "beige",
  // brown
  brown: "brown", brun: "brown", "dark brown": "brown", mörkbrun: "brown", cognac: "brown", tan: "brown",
  konjak: "brown", mocha: "brown", chocolate: "brown", "chocolate brown": "brown", "light brown": "brown",
  ljusbrun: "brown", "mid brown": "brown", rust: "brown", cinnamon: "brown", choklad: "brown",
  // navy
  navy: "navy", marin: "navy", marinblå: "navy", "dark navy": "navy", "dark blue": "navy",
  mörkblå: "navy", "navy blue": "navy",
  // blue
  blue: "blue", blå: "blue", "light blue": "blue", ljusblå: "blue", denim: "blue", indigo: "blue",
  turquoise: "blue", turkos: "blue", "mid blue": "blue", "medium blue": "blue", "sky blue": "blue",
  "petrol": "blue", "royal blue": "blue",
  // green
  green: "green", grön: "green", "dark green": "green", mörkgrön: "green", mint: "green",
  "light green": "green", ljusgrön: "green", "forest green": "green", "bottle green": "green",
  // olive
  olive: "olive", oliv: "olive", olivgrön: "olive", army: "olive", military: "olive",
  "olive green": "olive", "army green": "olive", "khaki green": "olive",
  // red
  red: "red", röd: "red", rost: "red", "dark red": "red", mörkröd: "red",
  // burgundy
  burgundy: "burgundy", vinröd: "burgundy", bordeaux: "burgundy", wine: "burgundy", plommon: "burgundy",
  plum: "burgundy",
  // pink
  pink: "pink", rosa: "pink", "light pink": "pink", ljusrosa: "pink", "dusty pink": "pink",
  "old pink": "pink", gammelrosa: "pink",
  // purple
  purple: "purple", lila: "purple", lavender: "purple", lavendel: "purple",
  // yellow
  yellow: "yellow", gul: "yellow", mustard: "yellow", senap: "yellow", "light yellow": "yellow",
  // orange
  orange: "orange",
  // multi
  multi: "multi", multicolor: "multi", multicolour: "multi", flerfärgad: "multi", mönstrad: "multi",
  // metallics
  silver: "silver", gold: "gold", guld: "gold",
};

export const BASE_GENDERS: Record<string, Gender> = {
  male: "men", man: "men", men: "men", herr: "men", herrar: "men", mens: "men",
  female: "women", woman: "women", women: "women", dam: "women", damer: "women", kvinna: "women",
  womens: "women",
  unisex: "unisex",
};

export const BASE_AVAILABILITY: Record<string, Availability> = {
  "in stock": "in_stock", in_stock: "in_stock", instock: "in_stock", available: "in_stock",
  "i lager": "in_stock",
  "out of stock": "out_of_stock", out_of_stock: "out_of_stock", outofstock: "out_of_stock",
  "slut i lager": "out_of_stock", "sold out": "out_of_stock",
  preorder: "preorder", "pre-order": "preorder", pre_order: "preorder",
  backorder: "backorder", "back order": "backorder",
};

export const BASE_CONDITIONS: Record<string, Condition> = {
  new: "new", ny: "new",
  used: "used", begagnad: "used",
  refurbished: "refurbished",
};

/**
 * Ordered category rules. Each is tested against single category-path
 * segments (deepest first) and then against the product title. The first
 * rule that matches wins, so more specific rules come first.
 */
export interface CategoryRule {
  pattern: RegExp;
  category: Category;
  subcategory?: string;
}

/**
 * Brands that only make one kind of product. Checked before anything else, so
 * model names can't mislead ("Hav. Top Senses" is a flip-flop, not a top).
 */
export const BASE_BRAND_CATEGORIES: Record<string, { category: Category; subcategory?: string }> = {
  havaianas: { category: "shoes", subcategory: "sandals" },
};

const LETTER = "a-zåäöéüæø";

/**
 * Swedish noun stems: match as a word *ending*, so compounds work —
 * "skjort(a|or)" hits "Businesskjortor", "Linneskjorta", "Flanellskjortor".
 */
function sv(...stems: string[]): RegExp {
  return new RegExp(`(?:${stems.join("|")})(?![${LETTER}])`, "i");
}

/** Whole words only. Unicode-aware (`\b` is ASCII-only in JS); hyphens join words. */
function word(...words: string[]): RegExp {
  return new RegExp(`(?<![${LETTER}-])(?:${words.join("|")})(?![${LETTER}-])`, "i");
}

const rule = (pattern: RegExp, category: Category, subcategory?: string): CategoryRule => ({
  pattern,
  category,
  subcategory,
});

/**
 * Words that settle the category whatever garment is named: "pyjamas"
 * T-shirt is loungewear, "badbyxor" (swim trunks) are swimwear. Checked in the
 * title and the opening of the description before any other rule.
 */
export const BASE_DECISIVE_RULES: CategoryRule[] = [
  rule(sv("pyjamas", "pyjamasbyx(a|or)", "pyjamasskjort(a|or)", "morgonrock(ar)?", "nattlinne(n)?", "nattskjort(a|or)"), "loungewear"),
  rule(word("pyjamas?", "pajamas?", "pj", "nightwear", "sleepwear", "robe"), "loungewear"),
  rule(sv("badbyx(a|or)", "badshorts", "baddräkt(er)?", "bikini"), "swimwear"),
  rule(word("swim ?(wear|shorts|trunks?)", "swimsuit", "bikini"), "swimwear"),
];

export const BASE_CATEGORY_RULES: CategoryRule[] = [
  // Specific compounds that would otherwise be caught by a broader rule below.
  rule(sv("morgonrock(ar)?", "pyjamas?", "pyjamasbyx(a|or)"), "loungewear"),
  rule(word("robe", "loungewear", "pyjamas?"), "loungewear"),
  rule(sv("badbyx(a|or)", "badshorts", "badkläder", "baddräkt(er)?", "bikini"), "swimwear"),
  rule(word("swim ?(wear|shorts|trunks?)?", "swimsuit"), "swimwear"),
  rule(sv("kostymbyx(a|or)"), "trousers", "suit trousers"),
  rule(sv("kostymväst(ar)?"), "waistcoats", "suit waistcoat"),
  rule(sv("jeansskjort(a|or)", "denimskjort(a|or)"), "shirts", "denim shirt"),
  rule(sv("jeansjack(a|or)", "denimjack(a|or)"), "outerwear", "denim jacket"),
  rule(sv("jeansshorts"), "shorts", "denim shorts"),
  rule(word("chino shorts?"), "shorts"),
  rule(sv("jeanskjol(ar)?"), "skirts", "denim skirt"),
  rule(sv("skjortjack(a|or)"), "shirts", "overshirt"),
  rule(word("overshirts?", "shackets?", "shirt ?jackets?", "shirt ?jkt"), "shirts", "overshirt"),
  rule(sv("stickade? västar", "stickad väst"), "knitwear", "knitted vest"),
  rule(word("down vests?", "puffer vests?", "padded vests?", "insulated vests?"), "outerwear", "down vest"),

  // Tailoring
  rule(sv("kostym(er)?", "smoking"), "suits", "suit"),
  rule(word("suits?", "tuxedos?"), "suits", "suit"),
  rule(sv("kavaj(er)?"), "blazers", "blazer"),
  rule(word("blazers?", "sport ?coats?"), "blazers", "blazer"),
  rule(sv("väst(ar|en|arna)?"), "waistcoats", "waistcoat"),
  rule(word("waistcoats?", "gilets?", "vests?"), "waistcoats", "waistcoat"),

  // Shirts & tops
  rule(word("t-?shirts?", "t-?shirten", "t-?tröj(a|or|an)", "tees?", "tank ?tops?", "tanks?"), "t-shirts"),
  rule(sv("t-shirts?"), "t-shirts"), // path compounds, e.g. "Basic-t-shirts"
  rule(sv("linneskjort(a|or)"), "shirts", "linen shirt"),
  rule(sv("flanellskjort(a|or)"), "shirts", "flannel shirt"),
  rule(sv("oxfordskjort(a|or)"), "shirts", "oxford shirt"),
  rule(word("oxford ?shirts?", "oxford skjort(a|or)"), "shirts", "oxford shirt"),
  rule(sv("businesskjort(a|or)", "kostymskjort(a|or)"), "shirts", "dress shirt"),
  rule(sv("skjort(a|or|an|orna)", "blus(ar|en|arna)?"), "shirts"),
  rule(word("shirts?", "blouses?"), "shirts"),
  rule(sv("pikétröj(a|or|an|orna)", "piké(er|n|erna)?", "pike(er|n)?"), "polos", "polo"),
  rule(word("polos?", "polo ?shirts?"), "polos", "polo"),

  // Knit & sweat
  rule(sv("cardigan(s|en)?", "kof(ta|tor|tan)"), "knitwear", "cardigan"),
  rule(sv("polotröj(a|or)"), "knitwear", "rollneck"),
  rule(word("turtlenecks?", "rollnecks?", "roll ?necks?"), "knitwear", "rollneck"),
  rule(sv("stickade? tröj(a|or)", "ulltröj(a|or)", "kashmirtröj(a|or)"), "knitwear"),
  rule(word("pullovers?", "pull", "jumpers?", "sweaters?", "knitwear", "c-neck", "v-neck"), "knitwear"),
  rule(sv("rugbytröj(a|or|an)"), "sweatshirts", "rugby shirt"),
  rule(word("ruggers?", "rugby( shirt)?"), "sweatshirts", "rugby shirt"),
  rule(sv("hoodies?", "huvtröj(a|or)", "collegetröj(a|or)", "sweatshirts?", "sweattröj(a|or)"), "sweatshirts"),
  rule(word("hoodies?", "hood", "zip hood", "sweatshirts?", "crewneck sweat"), "sweatshirts"),
  rule(word("half[- ]?zip", "quarter[- ]?zip"), "knitwear", "half-zip"),

  // Outerwear
  rule(sv("dunjack(a|or|an|orna)", "dunväst(ar|en)?"), "outerwear", "down jacket"),
  rule(word("puffer( jacket)?s?", "down jackets?"), "outerwear", "down jacket"),
  rule(sv("rock(ar|en)?", "kapp(a|or|an)", "trenchcoat(s|en)?"), "outerwear", "coat"),
  rule(word("overcoats?", "coats?", "trench( ?coats?)?", "car ?coats?"), "outerwear", "coat"),
  rule(sv("jack(a|or|an|orna)", "ytterplagg", "ytterkläder", "parkas?", "anorak(er)?"), "outerwear"),
  rule(word("jackets?", "jkt", "parkas?", "bombers?", "anoraks?", "insulated shell", "shell jackets?", "outerwear"), "outerwear"),

  // Bottoms
  rule(word("jeans", "denim"), "jeans"),
  rule(sv("chinos"), "trousers", "chinos"),
  rule(word("chinos?"), "trousers", "chinos"),
  rule(sv("manchesterbyx(a|or)"), "trousers", "corduroy trousers"),
  rule(sv("shorts(en)?"), "shorts"),
  rule(sv("byx(a|or|an|orna)", "joggers?"), "trousers"),
  rule(word("trousers?", "pants?", "track ?pants?", "trs", "slacks", "palazzo", "5[- ]?pocket", "5 pkt"), "trousers"),
  rule(sv("kjol(ar|en)?"), "skirts"),
  rule(word("skirts?"), "skirts"),
  rule(sv("klänning(ar|en)?"), "dresses"),
  rule(word("dress(es)?"), "dresses"),

  // Bags before shoes: "väskor" (bags) ends in "skor" (shoes).
  rule(sv("väsk(a|or)", "ryggsäck(ar)?", "necessär(er)?"), "bags"),
  rule(word("bags?", "backpacks?", "totes?", "shoppers?", "laptop( ?(bag|case|sleeve))?", "clutch"), "bags"),

  // Shoes
  rule(sv("sneakers?", "sneakern", "tygskor"), "shoes", "sneakers"),
  rule(sv("kängor", "känga", "boots?", "chelseaboots?"), "shoes", "boots"),
  rule(sv("loafers?", "mockasiner"), "shoes", "loafers"),
  rule(sv("sandal(er|s|en)?", "slides?", "tofflor", "flip-?flops?"), "shoes", "sandals"),
  rule(sv("skor(na)?", "sko(n)?"), "shoes"),
  rule(word("shoes?", "footwear", "derbys?", "brogues?", "pumps", "mules?", "heels"), "shoes"),

  // Underwear
  rule(sv("underkläder", "kalsong(er|erna)?", "strump(a|or|orna)", "trosor"), "underwear"),
  rule(word("underwear", "boxers?", "boxer briefs?", "briefs", "trunks?", "socks?", "bh"), "underwear"),

  // Bags & accessories
  rule(
    sv(
      "accessoarer", "bälte", "bälten", "slips", "fluga", "flugor", "mössa", "mössor", "keps", "kepsar",
      "hatt", "hattar", "halsduk(ar)?", "handskar", "plånbok", "plånböcker", "solglasögon", "smycken",
      "klock(a|or)", "näsduk(ar)?", "manschettknappar", "parfym(er)?", "doft(er)?", "hängslen",
      "sjal(ar)?", "korthållare", "bandana",
    ),
    "accessories",
  ),
  rule(
    word(
      "accessories", "belts?", "ties?", "bow ?ties?", "beanies?", "caps?", "hats?", "scarf", "scarves",
      "gloves", "wallets?", "sunglasses", "jewel(le)?ry", "watch(es)?", "pocket squares?", "cufflinks",
      "suspenders", "card ?holders?", "bandanas?", "cuff ?links",
    ),
    "accessories",
  ),

  // Material/construction words: only decide when no garment noun matched
  // ("Cashmere Coat" is a coat, "Knit Shorts" are shorts).
  rule(sv("stickat", "stickad", "stickade", "stickning"), "knitwear"),
  rule(word("knit(ted|s)?", "lambswool", "merino", "cashmere", "crew ?neck"), "knitwear"),
  rule(word("sweat"), "sweatshirts"),

  // Generic tops last
  rule(sv("tröj(a|or)", "topp(ar)?", "linnen?"), "tops"),
  rule(word("tops?"), "tops"),
];

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
  cream: "off-white", kräm: "off-white", "kräm vit": "off-white", ivory: "off-white", benvit: "off-white",
  naturvit: "off-white",
  // grey
  grey: "grey", gray: "grey", grå: "grey", "light grey": "grey", "dark grey": "grey", ljusgrå: "grey",
  mörkgrå: "grey", charcoal: "grey", antracit: "grey", anthracite: "grey", "grey melange": "grey",
  gråmelerad: "grey",
  // beige
  beige: "beige", sand: "beige", khaki: "beige", stone: "beige", taupe: "beige", camel: "beige",
  oat: "beige", natur: "beige", natural: "beige",
  // brown
  brown: "brown", brun: "brown", "dark brown": "brown", mörkbrun: "brown", cognac: "brown", tan: "brown",
  konjak: "brown", mocha: "brown", chocolate: "brown",
  // navy
  navy: "navy", marin: "navy", marinblå: "navy", "dark navy": "navy", "dark blue": "navy",
  mörkblå: "navy",
  // blue
  blue: "blue", blå: "blue", "light blue": "blue", ljusblå: "blue", denim: "blue", indigo: "blue",
  turquoise: "blue", turkos: "blue",
  // green
  green: "green", grön: "green", "dark green": "green", mörkgrön: "green", mint: "green",
  // olive
  olive: "olive", oliv: "olive", olivgrön: "olive", army: "olive",
  // red
  red: "red", röd: "red", rust: "red", rost: "red",
  // burgundy
  burgundy: "burgundy", vinröd: "burgundy", bordeaux: "burgundy", wine: "burgundy",
  // pink
  pink: "pink", rosa: "pink", "light pink": "pink", ljusrosa: "pink",
  // purple
  purple: "purple", lila: "purple", lavender: "purple", lavendel: "purple",
  // yellow
  yellow: "yellow", gul: "yellow", mustard: "yellow", senap: "yellow",
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

export const BASE_CATEGORY_RULES: CategoryRule[] = [
  // tailoring
  { pattern: /\b(kostym(byxor)?|suit trousers)\b/i, category: "suits", subcategory: "suit" },
  { pattern: /\b(kostymer|kostym|suits?|smoking|tuxedo)\b/i, category: "suits", subcategory: "suit" },
  { pattern: /\b(kavaj(er)?|blazers?|sport ?coats?)\b/i, category: "blazers", subcategory: "blazer" },
  { pattern: /\b(väst(ar)?|waistcoats?|gilet)\b/i, category: "waistcoats", subcategory: "waistcoat" },
  // shirts
  { pattern: /\b(linneskjort(a|or))\b/i, category: "shirts", subcategory: "linen shirt" },
  { pattern: /\b(overshirts?|skjortjack(a|or))\b/i, category: "shirts", subcategory: "overshirt" },
  { pattern: /\b(oxford)/i, category: "shirts", subcategory: "oxford shirt" },
  { pattern: /\b(skjort(a|or)|shirts?|blus(ar)?|blouses?)\b/i, category: "shirts" },
  { pattern: /\b(pik[eé](er)?|polos?|polo ?shirts?|pikétröj(a|or))\b/i, category: "polos", subcategory: "polo" },
  { pattern: /\b(t-?shirts?|tees?|linne|linnen|tank ?tops?)\b/i, category: "t-shirts" },
  // knit & sweat
  { pattern: /\b(cardigans?|koftor|kofta)\b/i, category: "knitwear", subcategory: "cardigan" },
  { pattern: /\b(stickat|stickade? tröj(a|or)|knit(wear|ted)?|pullover|merino|cashmere|kashmir|polotröj(a|or)|turtleneck|rollneck)\b/i, category: "knitwear" },
  { pattern: /\b(hoodies?|huvtröj(a|or)|sweatshirts?|college(tröj(a|or))?|sweats?)\b/i, category: "sweatshirts" },
  // outerwear
  { pattern: /\b(rock(ar)?|overcoats?|coats?|kappa|kappor|trench(coat)?)\b/i, category: "outerwear", subcategory: "coat" },
  { pattern: /\b(dunjack(a|or)|puffer|down jackets?)\b/i, category: "outerwear", subcategory: "down jacket" },
  { pattern: /\b(jack(a|or)|jackets?|parkas?|bombers?|anorak|ytterkläder|outerwear|vindjack(a|or)|regnjack(a|or))\b/i, category: "outerwear" },
  // bottoms
  { pattern: /\b(jeans|denim)\b/i, category: "jeans" },
  { pattern: /\b(chinos?)\b/i, category: "trousers", subcategory: "chinos" },
  { pattern: /\b(shorts|badshorts)\b/i, category: "shorts" },
  { pattern: /\b(byx(a|or)|trousers?|pants|joggers?|mjukisbyx(a|or))\b/i, category: "trousers" },
  { pattern: /\b(kjol(ar)?|skirts?)\b/i, category: "skirts" },
  { pattern: /\b(klänning(ar)?|dress(es)?)\b/i, category: "dresses" },
  // shoes
  { pattern: /\b(sneakers?|tygskor)\b/i, category: "shoes", subcategory: "sneakers" },
  { pattern: /\b(kängor|känga|boots?|chelsea)\b/i, category: "shoes", subcategory: "boots" },
  { pattern: /\b(loafers?|mockasiner)\b/i, category: "shoes", subcategory: "loafers" },
  { pattern: /\b(sandal(er|s)?|slides?|tofflor)\b/i, category: "shoes", subcategory: "sandals" },
  { pattern: /\b(skor|shoes?|footwear|derbys?|oxfords? shoes|brogues?)\b/i, category: "shoes" },
  // underwear / swim / lounge (before accessories so "strumpor" isn't lost)
  { pattern: /\b(badkläder|badbyx(a|or)|swim(wear|shorts)?|bikini|baddräkt)\b/i, category: "swimwear" },
  { pattern: /\b(underkläder|kalsong(er)?|boxers?|briefs|trunks|strump(a|or)|socks?|underwear|bh|trosor)\b/i, category: "underwear" },
  { pattern: /\b(pyjamas?|morgonrock(ar)?|loungewear|robe)\b/i, category: "loungewear" },
  // bags & accessories
  { pattern: /\b(väsk(a|or)|bags?|ryggsäck(ar)?|backpacks?|totes?|necessär)\b/i, category: "bags" },
  {
    pattern:
      /\b(accessoarer|accessories|bälte|bälten|belts?|slips|ties?|fluga|flugor|bow ?ties?|mössa|mössor|beanies?|kepsar|keps|caps?|hattar|hatt|hats?|halsduk(ar)?|scarf|scarves|handskar|gloves|plånbok|plånböcker|wallets?|solglasögon|sunglasses|smycken|jewellery|jewelry|klockor|watches|näsdukar|pocket squares?|manschettknappar|cufflinks|parfym|doft|hängslen|suspenders)\b/i,
    category: "accessories",
  },
  // generic tops last
  { pattern: /\b(tröj(a|or)|toppar|topp|tops?)\b/i, category: "tops" },
];

import { scoreFor, TAG_LABELS, type AffinityMap } from "@/lib/personalization";
import type { OutfitItems, OutfitRole, Product, ProductCategory, ShopperGender, StyleTag } from "@/lib/types";

/**
 * Which outfit slot each canonical category fills. Categories without a slot
 * (accessories, bags, underwear, swimwear, ...) can't anchor or join a look yet.
 */
export const CATEGORY_TO_ROLE: Partial<Record<ProductCategory, OutfitRole>> = {
  outerwear: "outerwear",
  blazers: "outerwear",
  suits: "outerwear",
  "t-shirts": "top",
  shirts: "top",
  polos: "top",
  knitwear: "top",
  sweatshirts: "top",
  tops: "top",
  waistcoats: "top",
  dresses: "top",
  trousers: "bottom",
  jeans: "bottom",
  shorts: "bottom",
  skirts: "bottom",
  shoes: "footwear",
};

/** Canonical categories that can fill a slot — what to fetch candidates from. */
export function categoriesForRole(role: OutfitRole): ProductCategory[] {
  return (Object.keys(CATEGORY_TO_ROLE) as ProductCategory[]).filter((c) => CATEGORY_TO_ROLE[c] === role);
}

/** Editorial label for each slot, used in the builder and outfit card. */
export const ROLE_LABEL: Record<OutfitRole, string> = {
  outerwear: "Outerwear",
  top: "Top",
  bottom: "Trousers",
  footwear: "Shoes",
};

/** Visual stacking order for any outfit, regardless of which piece anchored it. */
export const ROLE_DISPLAY_ORDER: OutfitRole[] = ["outerwear", "top", "bottom", "footwear"];

/** Which roles STYLEAI fills in, and in what order, once an anchor is chosen. */
export const SLOT_SEQUENCE_BY_ANCHOR_ROLE: Record<OutfitRole, OutfitRole[]> = {
  outerwear: ["top", "bottom", "footwear"],
  bottom: ["top", "outerwear", "footwear"],
  footwear: ["bottom", "top", "outerwear"],
  top: ["bottom", "outerwear", "footwear"],
};

export function roleFor(product: Product): OutfitRole | undefined {
  return CATEGORY_TO_ROLE[product.category];
}

/**
 * Which shopper gender to pick pieces for around a product: the product's own
 * if it's men's or women's, otherwise (unisex) the active style's.
 */
export function shopperGenderFor(product: Product, styleGender: ShopperGender | undefined): ShopperGender | undefined {
  return product.gender === "men" || product.gender === "women" ? product.gender : styleGender;
}

/** Pieces must be wearable together: same gender as the anchor, or unisex/unknown. */
export function genderCompatible(anchor: Product, candidate: Product): boolean {
  if (!anchor.gender || anchor.gender === "unisex") return true;
  return !candidate.gender || candidate.gender === "unisex" || candidate.gender === anchor.gender;
}

function candidatesFor(role: OutfitRole, anchor: Product, pool: Product[], exclude: Set<string>): Product[] {
  return pool.filter(
    (p) => roleFor(p) === role && p.available && !exclude.has(p.id) && genderCompatible(anchor, p),
  );
}

// ---------------------------------------------------------------------------
// Compatibility (uses AI enrichment where both pieces have it)
// ---------------------------------------------------------------------------

type Rule = "formality" | "season" | "pattern";
/**
 * Rule sets from strictest to loosest. A candidate's level is the first set it
 * satisfies; the last (empty) set always passes, so a slot is filled whenever
 * any candidate exists — coherence is preferred, never at the cost of an
 * empty slot. Formality is kept longest: it matters most.
 */
const RULE_LEVELS: Rule[][] = [["formality", "season", "pattern"], ["formality", "season"], ["formality"], []];
/** Patterns that compete with each other; solid and texture combine with anything. */
const PATTERNED = new Set(["stripe", "check", "print", "graphic"]);
/** Garments in one look stay within this formality span (e.g. jeans 2 + shirt 3 + blazer 4). */
const MAX_FORMALITY_SPAN = 2;

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

/**
 * Whether a candidate fits the pieces already in the look under the given
 * rules. Pieces without enrichment are unknown and never rule anything out,
 * so un-enriched catalogues behave exactly as before.
 *   formality  garments within MAX_FORMALITY_SPAN of each other; shoes within
 *              one level of the garments' average formality
 *   season     shares at least one season with every enriched piece
 *   pattern    at most one patterned piece per look
 */
function fits(candidate: Product, chosen: Product[], rules: Rule[]): boolean {
  const e = candidate.enrichment;
  if (!e) return true;
  const others = chosen.flatMap((p) => (p.enrichment ? [{ footwear: roleFor(p) === "footwear", e: p.enrichment }] : []));
  if (!others.length) return true;

  if (rules.includes("formality")) {
    const garments = others.filter((o) => !o.footwear).map((o) => o.e.formality);
    const shoes = others.filter((o) => o.footwear).map((o) => o.e.formality);
    if (roleFor(candidate) === "footwear") {
      if (garments.length && Math.abs(e.formality - Math.round(mean(garments))) > 1) return false;
    } else {
      const span = [...garments, e.formality];
      if (Math.max(...span) - Math.min(...span) > MAX_FORMALITY_SPAN) return false;
      if (shoes.some((f) => Math.abs(f - e.formality) > 1)) return false;
    }
  }
  if (rules.includes("season")) {
    const shared = others.reduce<Set<string> | null>(
      (acc, o) => new Set(o.e.seasons.filter((s) => !acc || acc.has(s))),
      null,
    );
    if (shared?.size && !e.seasons.some((s) => shared.has(s))) return false;
  }
  if (rules.includes("pattern") && PATTERNED.has(e.pattern) && others.some((o) => PATTERNED.has(o.e.pattern))) {
    return false;
  }
  return true;
}

/** 0 = fully compatible … RULE_LEVELS.length - 1 = only the legacy (no-rule) match. */
export function compatibilityLevel(candidate: Product, chosen: Product[]): number {
  return RULE_LEVELS.findIndex((rules) => fits(candidate, chosen, rules));
}

/** Most compatible first, then by style affinity; a stable sort keeps the pool's order for ties. */
function ranked(candidates: Product[], chosen: Product[], affinity: AffinityMap): Product[] {
  const level = new Map(candidates.map((c) => [c.id, compatibilityLevel(c, chosen)]));
  return [...candidates].sort(
    (a, b) => level.get(a.id)! - level.get(b.id)! || scoreFor(b, affinity) - scoreFor(a, affinity),
  );
}

/** Builds a complete outfit around an anchor product from a pool of candidates. */
export function generateOutfit(anchor: Product, pool: Product[], affinity: AffinityMap): OutfitItems {
  const anchorRole = roleFor(anchor);
  if (!anchorRole) return {};
  const items: OutfitItems = { [anchorRole]: anchor.id };
  const used = new Set([anchor.id]);
  const chosen: Product[] = [anchor];

  for (const role of SLOT_SEQUENCE_BY_ANCHOR_ROLE[anchorRole]) {
    const [pick] = ranked(candidatesFor(role, anchor, pool, used), chosen, affinity);
    if (pick) {
      items[role] = pick.id;
      used.add(pick.id);
      chosen.push(pick);
    }
  }
  return items;
}

/** Ranked replacement candidates for a single slot, excluding what's already there. */
export function alternativesFor(
  role: OutfitRole,
  items: OutfitItems,
  anchor: Product,
  pool: Product[],
  affinity: AffinityMap,
  count = 3,
): Product[] {
  const exclude = new Set(Object.values(items).filter((id): id is string => !!id));
  // Judge alternatives against the rest of the look, not the piece being replaced.
  const byId = new Map([anchor, ...pool].map((p) => [p.id, p]));
  const rest = ROLE_DISPLAY_ORDER.flatMap((r) => (r !== role && items[r] && byId.get(items[r]!) ? [byId.get(items[r]!)!] : []));
  return ranked(candidatesFor(role, anchor, pool, exclude), rest, affinity).slice(0, count);
}

export function outfitItemList(
  items: OutfitItems,
  lookup: (id: string) => Product | undefined,
): { role: OutfitRole; product: Product }[] {
  return ROLE_DISPLAY_ORDER.flatMap((role) => {
    const id = items[role];
    const product = id ? lookup(id) : undefined;
    return product ? [{ role, product }] : [];
  });
}

export function outfitTotal(list: { product: Product }[]): number {
  return list.reduce((sum, { product }) => sum + product.price, 0);
}

/** A plain-language line explaining why these pieces were put together. */
export function reasonForLook(products: Product[], affinity: AffinityMap): string {
  const tagCounts: Partial<Record<StyleTag, number>> = {};
  products.forEach((p) =>
    p.tags.forEach((tag) => {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    }),
  );
  const shared = (Object.keys(tagCounts) as StyleTag[])
    .filter((tag) => (tagCounts[tag] ?? 0) >= 2)
    .sort((a, b) => (affinity[b] ?? 0) - (affinity[a] ?? 0));

  if (shared.length >= 2) {
    return `Built around ${TAG_LABELS[shared[0]]} and ${TAG_LABELS[shared[1]]} — the combination you keep reaching for.`;
  }
  if (shared.length === 1) {
    return `Built around ${TAG_LABELS[shared[0]]}, pulled together into one easy look.`;
  }
  return "A considered mix of pieces that share the same quiet, easy attitude.";
}

const ROLE_SET = new Set<OutfitRole>(ROLE_DISPLAY_ORDER);

/** Link to an outfit page showing exactly these pieces (anchor first, as the start product). */
export function outfitHref(anchorId: string, items?: OutfitItems): string {
  if (!items) return `/outfit/${anchorId}`;
  const pairs = ROLE_DISPLAY_ORDER.flatMap((role) => (items[role] ? [`${role}:${items[role]}`] : []));
  return `/outfit/${anchorId}?items=${encodeURIComponent(pairs.join(","))}`;
}

/** Parses the `items` query param written by `outfitHref`; ignores anything malformed. */
export function parseOutfitItems(value: string | null | undefined): OutfitItems | undefined {
  if (!value) return undefined;
  const items: OutfitItems = {};
  for (const pair of value.split(",")) {
    const [role, id] = pair.split(":");
    if (ROLE_SET.has(role as OutfitRole) && /^[0-9a-f-]{36}$/i.test(id ?? "")) items[role as OutfitRole] = id;
  }
  return Object.keys(items).length ? items : undefined;
}

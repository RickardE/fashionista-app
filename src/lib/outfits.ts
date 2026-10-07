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

function bestOf(candidates: Product[], affinity: AffinityMap): Product | undefined {
  // Stable sort: ties keep the pool's (catalogue) order.
  return [...candidates].sort((a, b) => scoreFor(b, affinity) - scoreFor(a, affinity))[0];
}

/** Builds a complete outfit around an anchor product from a pool of candidates. */
export function generateOutfit(anchor: Product, pool: Product[], affinity: AffinityMap): OutfitItems {
  const anchorRole = roleFor(anchor);
  if (!anchorRole) return {};
  const items: OutfitItems = { [anchorRole]: anchor.id };
  const used = new Set([anchor.id]);

  for (const role of SLOT_SEQUENCE_BY_ANCHOR_ROLE[anchorRole]) {
    const pick = bestOf(candidatesFor(role, anchor, pool, used), affinity);
    if (pick) {
      items[role] = pick.id;
      used.add(pick.id);
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
  return candidatesFor(role, anchor, pool, exclude)
    .sort((a, b) => scoreFor(b, affinity) - scoreFor(a, affinity))
    .slice(0, count);
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

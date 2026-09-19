import { PRODUCTS, PRODUCTS_BY_ID, TAG_LABELS } from "@/lib/data/products";
import { scoreFor, type AffinityMap } from "@/lib/personalization";
import type { OutfitItems, OutfitRole, Product, ProductCategory, StyleTag } from "@/lib/types";

export const CATEGORY_TO_ROLE: Record<ProductCategory, OutfitRole> = {
  Jackets: "outerwear",
  Knitwear: "top",
  Shirts: "top",
  Trousers: "bottom",
  Shoes: "footwear",
};

/** Editorial label for each slot, used in the builder and outfit card. */
export const ROLE_LABEL: Record<OutfitRole, string> = {
  outerwear: "Outerwear",
  top: "Top",
  bottom: "Trousers",
  footwear: "Shoes",
};

/** Visual stacking order for any outfit, regardless of which piece anchored it. */
export const ROLE_DISPLAY_ORDER: OutfitRole[] = [
  "outerwear",
  "top",
  "bottom",
  "footwear",
];

/** Which roles STYLEAI fills in, and in what order, once an anchor is chosen. */
const SLOT_SEQUENCE_BY_ANCHOR_ROLE: Record<OutfitRole, OutfitRole[]> = {
  outerwear: ["top", "bottom", "footwear"],
  bottom: ["top", "outerwear", "footwear"],
  footwear: ["bottom", "top", "outerwear"],
  top: ["bottom", "outerwear", "footwear"],
};

export function roleFor(product: Product): OutfitRole {
  return CATEGORY_TO_ROLE[product.category];
}

function productsForRole(role: OutfitRole): Product[] {
  return PRODUCTS.filter((p) => CATEGORY_TO_ROLE[p.category] === role);
}

function bestForRole(
  role: OutfitRole,
  affinity: AffinityMap,
  excludeIds: Set<string>,
): string | undefined {
  const candidates = productsForRole(role).filter((p) => !excludeIds.has(p.id));
  if (candidates.length === 0) return undefined;
  return [...candidates].sort(
    (a, b) => scoreFor(b.id, affinity) - scoreFor(a.id, affinity),
  )[0].id;
}

/** Builds a complete outfit around an anchor product, filling every other slot. */
export function generateOutfit(
  anchorId: string,
  affinity: AffinityMap,
): OutfitItems {
  const anchor = PRODUCTS_BY_ID[anchorId];
  if (!anchor) return {};
  const anchorRole = roleFor(anchor);
  const items: OutfitItems = { [anchorRole]: anchorId };
  const used = new Set([anchorId]);

  for (const role of SLOT_SEQUENCE_BY_ANCHOR_ROLE[anchorRole]) {
    const pick = bestForRole(role, affinity, used);
    if (pick) {
      items[role] = pick;
      used.add(pick);
    }
  }
  return items;
}

/** Ranked replacement candidates for a single slot, excluding what's already there. */
export function alternativesFor(
  role: OutfitRole,
  items: OutfitItems,
  affinity: AffinityMap,
  count = 3,
): Product[] {
  const currentId = items[role];
  const pool = productsForRole(role).filter((p) => p.id !== currentId);
  return [...pool]
    .sort((a, b) => scoreFor(b.id, affinity) - scoreFor(a.id, affinity))
    .slice(0, count);
}

export function outfitItemList(
  items: OutfitItems,
): { role: OutfitRole; product: Product }[] {
  return ROLE_DISPLAY_ORDER.filter((role) => items[role]).map((role) => ({
    role,
    product: PRODUCTS_BY_ID[items[role] as string],
  }));
}

export function outfitTotal(items: OutfitItems): number {
  return outfitItemList(items).reduce((sum, { product }) => sum + product.price, 0);
}

/** A plain-language line explaining why these pieces were put together. */
export function reasonForLook(items: OutfitItems, affinity: AffinityMap): string {
  const products = outfitItemList(items).map((i) => i.product);
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

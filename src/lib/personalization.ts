import { PRODUCTS, PRODUCTS_BY_ID, TAG_LABELS } from "@/lib/data/products";
import type { Product, StyleTag } from "@/lib/types";

export type AffinityMap = Partial<Record<StyleTag, number>>;

export function scoreFor(id: string, affinity: AffinityMap): number {
  const product = PRODUCTS_BY_ID[id];
  if (!product) return 0;
  return product.tags.reduce((sum, tag) => sum + (affinity[tag] ?? 0), 0);
}

/** Keeps the current + next card stable while the rest of the deck re-sorts by taste. */
export function reorderTail(
  order: string[],
  index: number,
  affinity: AffinityMap,
): string[] {
  const head = order.slice(0, index + 2);
  const tail = order.slice(index + 2);
  const sorted = [...tail].sort(
    (a, b) => scoreFor(b, affinity) - scoreFor(a, affinity),
  );
  return [...head, ...sorted];
}

export function rankedIds(affinity: AffinityMap): string[] {
  return PRODUCTS.map((p) => p.id).sort(
    (a, b) => scoreFor(b, affinity) - scoreFor(a, affinity),
  );
}

export function topTags(affinity: AffinityMap, n: number): StyleTag[] {
  return (Object.keys(affinity) as StyleTag[])
    .filter((tag) => (affinity[tag] ?? 0) > 0)
    .sort((a, b) => (affinity[b] ?? 0) - (affinity[a] ?? 0))
    .slice(0, n);
}

export function reasonFor(product: Product, affinity: AffinityMap): string {
  const hits = topTags(affinity, 4)
    .filter((tag) => product.tags.includes(tag))
    .slice(0, 2);
  if (hits.length === 2) {
    return `Because you keep choosing ${TAG_LABELS[hits[0]]} and ${TAG_LABELS[hits[1]]}.`;
  }
  if (hits.length === 1) {
    return `Because you tend to like ${TAG_LABELS[hits[0]]}. ${product.reason}`;
  }
  return product.reason;
}

export function tuningLabel(interactions: number): string {
  if (interactions < 3) return "Getting to know you";
  if (interactions < 6) return "Learning your taste";
  return "Tuned to you";
}

export function accuracyFor(interactions: number): number {
  return Math.min(94, 34 + interactions * 8);
}

export function mergeAffinity(...maps: AffinityMap[]): AffinityMap {
  const merged: AffinityMap = {};
  maps.forEach((map) => {
    (Object.keys(map) as StyleTag[]).forEach((tag) => {
      merged[tag] = (merged[tag] ?? 0) + (map[tag] ?? 0);
    });
  });
  return merged;
}

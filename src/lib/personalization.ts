import { TAG_LABELS } from "@/lib/style-tags";
import type { Product, StyleTag } from "@/lib/types";

export type AffinityMap = Partial<Record<StyleTag, number>>;

export { TAG_LABELS };

/** How well a product's tags match a style's learned affinity. */
export function scoreFor(product: Product, affinity: AffinityMap): number {
  return product.tags.reduce((sum, tag) => sum + (affinity[tag] ?? 0), 0);
}

export function topTags(affinity: AffinityMap, n: number): StyleTag[] {
  return (Object.keys(affinity) as StyleTag[])
    .filter((tag) => (affinity[tag] ?? 0) > 0)
    .sort((a, b) => (affinity[b] ?? 0) - (affinity[a] ?? 0))
    .slice(0, n);
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

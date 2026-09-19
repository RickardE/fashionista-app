import { PRODUCTS_BY_ID } from "@/lib/data/products";
import { mergeAffinity, rankedIds } from "@/lib/personalization";
import type { StyleProfile, StyleTag } from "@/lib/types";

/** Plain-language colour/fit hints per tag, used only as a fallback until a
 * style has enough of its own liked pieces to speak for themselves. */
const TAG_COLOR_HINTS: Partial<Record<StyleTag, string[]>> = {
  natural: ["White", "Beige", "Sand"],
  tailoring: ["Black", "Charcoal", "Navy"],
  black: ["Black", "Charcoal"],
  relaxed: ["Stone", "Off-white", "Grey"],
  neutral: ["Grey", "Stone", "White"],
  leather: ["Black", "Brown"],
  knitwear: ["Cream", "Grey"],
  outerwear: ["Charcoal", "Olive"],
};

const TAG_FIT_HINTS: Partial<Record<StyleTag, string[]>> = {
  relaxed: ["Relaxed", "Loose"],
  oversized: ["Oversized"],
  wide: ["Wide leg"],
  tailoring: ["Tailored", "Structured"],
  natural: ["Relaxed", "Easy"],
};

function topSeedTags(style: StyleProfile): StyleTag[] {
  return (Object.keys(style.seedAffinity) as StyleTag[]).sort(
    (a, b) => (style.seedAffinity[b] ?? 0) - (style.seedAffinity[a] ?? 0),
  );
}

export function colorsFor(style: StyleProfile): string[] {
  const likedIds = Object.keys(style.liked);
  if (likedIds.length) {
    const counts = new Map<string, number>();
    likedIds.forEach((id) => {
      const c = PRODUCTS_BY_ID[id]?.color;
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    });
    const sorted = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c);
    if (sorted.length >= 2) return sorted.slice(0, 3);
  }
  const hinted = Array.from(
    new Set(topSeedTags(style).flatMap((t) => TAG_COLOR_HINTS[t] ?? [])),
  );
  return hinted.length ? hinted.slice(0, 3) : ["Black", "White", "Grey"];
}

export function fitsFor(style: StyleProfile): string[] {
  const likedIds = Object.keys(style.liked);
  if (likedIds.length) {
    const counts = new Map<string, number>();
    likedIds.forEach((id) => {
      const f = PRODUCTS_BY_ID[id]?.fit;
      if (f) counts.set(f, (counts.get(f) ?? 0) + 1);
    });
    const sorted = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([f]) => f);
    if (sorted.length >= 1) return sorted.slice(0, 2);
  }
  const hinted = Array.from(
    new Set(topSeedTags(style).flatMap((t) => TAG_FIT_HINTS[t] ?? [])),
  );
  return hinted.length ? hinted.slice(0, 2) : ["Regular", "Relaxed"];
}

export function keyPiecesFor(style: StyleProfile): string[] {
  const effective = mergeAffinity(style.seedAffinity, style.affinity);
  return rankedIds(effective)
    .slice(0, 3)
    .map((id) => PRODUCTS_BY_ID[id].name);
}

/**
 * Composes the Outfits feed from real catalogue products, reusing the Build
 * the Look composition (generateOutfit). Not personalized beyond what that
 * already does; the recommendation engine comes later.
 */

import { generateOutfit, outfitItemList, roleFor } from "@/lib/outfits";
import type { AffinityMap } from "@/lib/personalization";
import type { OutfitItems, OutfitRole, Product } from "@/lib/types";

export interface FeedOutfit {
  /** Stable key for rendering. */
  key: string;
  anchorId: string;
  items: OutfitItems;
  pieces: { role: OutfitRole; product: Product }[];
}

/** An outfit card needs at least this many pieces to be worth showing. */
export const MIN_OUTFIT_PIECES = 3;
/** Pieces used in this many recent outfits are held back, so consecutive outfits differ. */
const RECENT_WINDOW = 24;

/**
 * Builds one outfit per usable anchor. `pool` holds candidates for the other
 * slots; `recent` lists piece ids used lately (newest last) and is returned
 * updated, so variety carries across pages.
 */
export function composeOutfits(
  anchors: Product[],
  pool: Product[],
  affinity: AffinityMap,
  recent: string[] = [],
): { outfits: FeedOutfit[]; recent: string[] } {
  const outfits: FeedOutfit[] = [];
  let used = [...recent];
  const byId = new Map(pool.map((p) => [p.id, p]));

  for (const anchor of anchors) {
    if (!anchor.available || !roleFor(anchor)) continue;
    byId.set(anchor.id, anchor);
    const held = new Set(used.slice(-RECENT_WINDOW));
    const items = generateOutfit(
      anchor,
      pool.filter((p) => !held.has(p.id) && p.id !== anchor.id),
      affinity,
    );
    const pieces = outfitItemList(items, (id) => byId.get(id));
    if (pieces.length < MIN_OUTFIT_PIECES) continue;
    outfits.push({ key: `${anchor.id}:${pieces.map((p) => p.product.id).join(",")}`, anchorId: anchor.id, items, pieces });
    used = [...used, ...pieces.filter((p) => p.product.id !== anchor.id).map((p) => p.product.id)].slice(-RECENT_WINDOW * 4);
  }
  return { outfits, recent: used };
}

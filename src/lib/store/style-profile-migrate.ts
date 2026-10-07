/**
 * Persisted style-profile state versions.
 *
 * v2 referenced the 12 mock products by slug ids ("nn07-overshirt"). v3 holds
 * canonical catalogue ids (uuids) and loads the feed page by page. Migrating
 * keeps every Style — name, seed, learned affinity — and drops only references
 * to products that no longer exist.
 */

import type { Outfit, StyleProfile } from "@/lib/types";

export const STORAGE_KEY = "styleai:v3";
export const LEGACY_STORAGE_KEYS = ["styleai:v2"];

const PRODUCT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isCatalogId = (id: unknown): id is string => typeof id === "string" && PRODUCT_ID.test(id);

export interface PersistedState {
  styles: Record<string, StyleProfile>;
  styleOrder: string[];
  activeStyleId: string;
  hasOnboarded: boolean;
  savedOutfits: Outfit[];
}

type Loose = Record<string, unknown>;

function keepCatalogIds(map: unknown): Record<string, true> {
  if (!map || typeof map !== "object") return {};
  return Object.fromEntries(Object.keys(map).filter(isCatalogId).map((id) => [id, true as const]));
}

function migrateStyle(raw: Loose, sameVersion: boolean): StyleProfile {
  const style = raw as unknown as StyleProfile;
  const feedOrder = sameVersion && Array.isArray(raw.feedOrder) ? (raw.feedOrder as unknown[]).filter(isCatalogId) : [];
  return {
    ...style,
    liked: keepCatalogIds(raw.liked),
    disliked: keepCatalogIds(raw.disliked),
    seedAffinity: style.seedAffinity ?? {},
    affinity: style.affinity ?? {},
    feedOrder,
    feedIndex: sameVersion ? Math.min(Number(raw.feedIndex) || 0, feedOrder.length) : 0,
    feedExhausted: sameVersion ? raw.feedExhausted === true : false,
    gender: raw.gender === "men" || raw.gender === "women" ? raw.gender : undefined,
    outfitAffinity: style.outfitAffinity ?? {},
    likedOutfits: Number(raw.likedOutfits) || 0,
    dislikedOutfits: Number(raw.dislikedOutfits) || 0,
    outfitCursor: sameVersion && isCatalogId(raw.outfitCursor) ? raw.outfitCursor : undefined,
  };
}

function outfitIsValid(o: Outfit): boolean {
  return isCatalogId(o.anchorId) && Object.values(o.items ?? {}).every(isCatalogId);
}

/**
 * Normalizes persisted state from any known version into the current shape.
 * Returns null for unrecognizable input (caller starts fresh).
 */
export function migratePersistedState(raw: unknown, fromKey: string): Partial<PersistedState> | null {
  if (!raw || typeof raw !== "object") return null;
  const state = raw as Loose;
  const sameVersion = fromKey === STORAGE_KEY;
  const styles = (state.styles && typeof state.styles === "object" ? state.styles : {}) as Record<string, Loose>;

  return {
    ...(state as Partial<PersistedState>),
    styles: Object.fromEntries(Object.entries(styles).map(([id, s]) => [id, migrateStyle(s, sameVersion)])),
    savedOutfits: Array.isArray(state.savedOutfits) ? (state.savedOutfits as Outfit[]).filter(outfitIsValid) : [],
  };
}

/**
 * Server sync for the style-profile state.
 *
 * The reducer stays the single place where state changes. After a change, the
 * provider diffs the last state the server acknowledged against the current
 * one and sends the difference as a batch of idempotent operations — so a
 * failed batch is simply recomputed (and merged with later changes) next time.
 *
 * Feed positions (feedOrder, feedIndex, feedExhausted, outfitCursor) and the
 * swipe hint are per device and never synced.
 */

import type { Outfit, ShopperGender, StyleProfile, StyleTag } from "@/lib/types";

/** The part of a style the server stores (besides its likes/dislikes). */
export interface SyncedStyleFields {
  id: string;
  name: string;
  description: string;
  gender?: ShopperGender;
  seedAffinity: Partial<Record<StyleTag, number>>;
  affinity: Partial<Record<StyleTag, number>>;
  outfitAffinity: Partial<Record<StyleTag, number>>;
  interactions: number;
  likedOutfits: number;
  dislikedOutfits: number;
  createdAt: number;
}

export type SyncedStyle = SyncedStyleFields & {
  /** Product ids, oldest first. */
  liked: string[];
  disliked: string[];
};

/** What GET /api/me/state returns. Null for a user with nothing stored yet. */
export interface SyncedState {
  /** In display order. */
  styles: SyncedStyle[];
  activeStyleId: string | null;
  hasOnboarded: boolean;
  /** Newest first. */
  savedOutfits: Outfit[];
}

export type SyncOp =
  | { op: "upsertStyle"; style: SyncedStyleFields; position: number }
  | { op: "deleteStyle"; styleId: string }
  | { op: "react"; styleId: string; productId: string; reaction: "like" | "dislike" | null }
  | { op: "saveOutfit"; outfit: Outfit }
  | { op: "removeOutfit"; outfitId: string }
  | { op: "prefs"; activeStyleId: string; hasOnboarded: boolean };

/** The synced subset of the client state (structurally a PersistedState). */
export interface SyncableState {
  styles: Record<string, StyleProfile>;
  styleOrder: string[];
  activeStyleId: string;
  hasOnboarded: boolean;
  savedOutfits: Outfit[];
}

export const EMPTY_SYNCED: SyncableState = {
  styles: {},
  styleOrder: [],
  activeStyleId: "",
  hasOnboarded: false,
  savedOutfits: [],
};

export function styleFields(style: StyleProfile): SyncedStyleFields {
  return {
    id: style.id,
    name: style.name,
    description: style.description,
    gender: style.gender,
    seedAffinity: style.seedAffinity,
    affinity: style.affinity,
    outfitAffinity: style.outfitAffinity,
    interactions: style.interactions,
    likedOutfits: style.likedOutfits,
    dislikedOutfits: style.dislikedOutfits,
    createdAt: style.createdAt,
  };
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function reactionOf(style: StyleProfile | undefined, productId: string): "like" | "dislike" | null {
  if (style?.liked[productId]) return "like";
  if (style?.disliked[productId]) return "dislike";
  return null;
}

/**
 * Operations that turn `prev` into `next` on the server. Ordered so a style
 * exists before its reactions/outfits refer to it, and is deleted last.
 */
export function diffState(prev: SyncableState, next: SyncableState): SyncOp[] {
  const ops: SyncOp[] = [];

  next.styleOrder.forEach((id, position) => {
    const style = next.styles[id];
    if (!style) return;
    const before = prev.styles[id];
    const fields = styleFields(style);
    if (!before || prev.styleOrder.indexOf(id) !== position || !sameJson(styleFields(before), fields)) {
      ops.push({ op: "upsertStyle", style: fields, position });
    }
  });

  for (const id of next.styleOrder) {
    const style = next.styles[id];
    const before = prev.styles[id];
    if (!style) continue;
    const productIds = new Set([
      ...Object.keys(style.liked),
      ...Object.keys(style.disliked),
      ...Object.keys(before?.liked ?? {}),
      ...Object.keys(before?.disliked ?? {}),
    ]);
    for (const productId of productIds) {
      const reaction = reactionOf(style, productId);
      if (reaction !== reactionOf(before, productId)) ops.push({ op: "react", styleId: id, productId, reaction });
    }
  }

  const prevOutfits = new Set(prev.savedOutfits.map((o) => o.id));
  const nextOutfits = new Set(next.savedOutfits.map((o) => o.id));
  // Oldest first, so server insertion order matches the client's.
  for (const outfit of [...next.savedOutfits].reverse()) {
    if (!prevOutfits.has(outfit.id)) ops.push({ op: "saveOutfit", outfit });
  }
  for (const outfit of prev.savedOutfits) {
    if (!nextOutfits.has(outfit.id)) ops.push({ op: "removeOutfit", outfitId: outfit.id });
  }

  if (next.activeStyleId !== prev.activeStyleId || next.hasOnboarded !== prev.hasOnboarded) {
    ops.push({ op: "prefs", activeStyleId: next.activeStyleId, hasOnboarded: next.hasOnboarded });
  }

  for (const id of prev.styleOrder) {
    if (!next.styles[id]) ops.push({ op: "deleteStyle", styleId: id });
  }
  return ops;
}

/** Server state → the client's synced fields (device-local feed fields start empty). */
export function fromSynced(state: SyncedState): SyncableState {
  const styles: Record<string, StyleProfile> = {};
  for (const s of state.styles) {
    styles[s.id] = {
      ...s,
      liked: Object.fromEntries(s.liked.map((id) => [id, true as const])),
      disliked: Object.fromEntries(s.disliked.map((id) => [id, true as const])),
      feedOrder: [],
      feedIndex: 0,
      feedExhausted: false,
      showSwipeHint: s.interactions === 0,
    };
  }
  const styleOrder = state.styles.map((s) => s.id);
  return {
    styles,
    styleOrder,
    activeStyleId: state.activeStyleId && styles[state.activeStyleId] ? state.activeStyleId : (styleOrder[0] ?? ""),
    hasOnboarded: state.hasOnboarded,
    savedOutfits: state.savedOutfits,
  };
}

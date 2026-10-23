"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { fetchFeedPage, fetchProducts } from "@/lib/api";
import { composeOutfits, type FeedOutfit } from "@/lib/outfit-feed";
import { categoriesForRole, ROLE_DISPLAY_ORDER } from "@/lib/outfits";
import { useCatalog } from "@/lib/store/product-catalog";
import { useStyleProfile } from "@/lib/store/style-profile-context";
import type { OutfitItems, Product, ShopperGender } from "@/lib/types";

const ANCHOR_PAGE = 20;
const CANDIDATES_PER_SLOT = 50;
/** Compose more outfits while this many are still ahead, so swipes never wait. */
const PREFETCH_AT = 4;

/** Candidate pieces per gender, shared by all styles for the session. */
const pools = new Map<string, Promise<Product[]>>();

function poolFor(gender: ShopperGender): Promise<Product[]> {
  const key = gender;
  let pool = pools.get(key);
  if (!pool) {
    pool = Promise.all(
      ROLE_DISPLAY_ORDER.map((role) =>
        fetchProducts({ categories: categoriesForRole(role), gender, limit: CANDIDATES_PER_SLOT }),
      ),
    ).then((pages) => pages.flatMap((p) => p.products));
    pool.catch(() => pools.delete(key));
    pools.set(key, pool);
  }
  return pool;
}

interface StyleOutfits {
  outfits: FeedOutfit[];
  index: number;
  recent: string[];
  /** Last anchor fetched, to page on from. */
  cursor?: string;
  /** No anchors left that the style hasn't swiped. */
  exhausted?: boolean;
  /** True right after the outfit before `index` was kept from its page, until the feed has shown it. */
  kept?: boolean;
}

/**
 * Composed outfits outlive the Outfits page for the session, so opening an
 * outfit and coming back lands on the same card. The outfit page can change
 * them too (see `keepFeedOutfit`), so the feed subscribes rather than copies.
 */
let session: Record<string, StyleOutfits> = {};
const NO_OUTFITS: Record<string, StyleOutfits> = {};
const listeners = new Set<() => void>();

function updateSession(fn: (all: Record<string, StyleOutfits>) => Record<string, StyleOutfits>) {
  session = fn(session);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
/**
 * Keeps the feed's current outfit as changed on its page and moves past it,
 * as a right swipe would. False when that outfit is no longer the current
 * card (e.g. the page was reloaded, which starts the feed afresh).
 */
export function keepFeedOutfit(key: string, items: OutfitItems, pieces: FeedOutfit["pieces"]): boolean {
  for (const [id, feed] of Object.entries(session)) {
    const outfit = feed.outfits[feed.index];
    if (outfit?.key !== key) continue;
    const outfits = feed.outfits.map((o, i) => (i === feed.index ? { ...o, items, pieces } : o));
    updateSession((all) => ({ ...all, [id]: { ...feed, outfits, index: feed.index + 1, kept: true } }));
    return true;
  }
  return false;
}

export type OutfitFeedStatus = "ready" | "loading" | "error" | "needs_gender" | "exhausted";

/**
 * The active style's Outfits feed. Outfits are composed on the client from
 * catalogue products; each style keeps its own position for the session. The
 * server leaves out anchors the style has already swiped, so a reload or
 * another device continues with new outfits.
 */
export function useOutfitFeed() {
  const { activeStyle, effectiveAffinity } = useStyleProfile();
  const { ingest } = useCatalog();
  const gender = activeStyle.gender;
  // Outfits are kept per style *and* gender: switching gender starts fresh.
  const styleId = `${activeStyle.id}:${gender ?? "-"}`;
  const byStyle = useSyncExternalStore(subscribe, () => session, () => NO_OUTFITS);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const inFlight = useRef(new Set<string>());

  const current = byStyle[styleId] ?? { outfits: [], index: 0, recent: [] };
  const remaining = current.outfits.length - current.index;
  const failed = !!errors[styleId];
  const { cursor, exhausted } = current;

  useEffect(() => {
    if (!gender || failed || exhausted || remaining >= PREFETCH_AT || inFlight.current.has(styleId)) return;
    inFlight.current.add(styleId);
    const affinity = effectiveAffinity;
    const recent = current.recent;

    fetchFeedPage({ cursor, limit: ANCHOR_PAGE, gender, kind: "outfits", style: activeStyle.id })
      .then(async (page) => {
        const pool = await poolFor(gender);
        ingest([...page.products, ...pool]);
        const composed = composeOutfits(page.products, pool, affinity, recent);
        updateSession((all) => {
          const prev = all[styleId] ?? { outfits: [], index: 0, recent: [] };
          return {
            ...all,
            [styleId]: {
              outfits: [...prev.outfits, ...composed.outfits],
              index: prev.index,
              recent: composed.recent,
              cursor: page.products.at(-1)?.id ?? prev.cursor,
              exhausted: page.nextCursor === null,
            },
          };
        });
        setErrors((e) => ({ ...e, [styleId]: false }));
      })
      .catch(() => setErrors((e) => ({ ...e, [styleId]: true })))
      .finally(() => inFlight.current.delete(styleId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleId, gender, failed, exhausted, remaining, cursor]);

  return {
    outfit: current.outfits[current.index] as FeedOutfit | undefined,
    nextOutfit: current.outfits[current.index + 1] as FeedOutfit | undefined,
    status: (!gender
      ? "needs_gender"
      : failed
        ? "error"
        : remaining > 0
          ? "ready"
          : exhausted
            ? "exhausted"
            : "loading") as OutfitFeedStatus,
    advance: () =>
      updateSession((all) => {
        const prev = all[styleId];
        return prev ? { ...all, [styleId]: { ...prev, index: prev.index + 1, kept: false } } : all;
      }),
    /** Key of the outfit before the current one — the one an undo returns to. */
    previousKey: current.outfits[current.index - 1]?.key as string | undefined,
    back: () =>
      updateSession((all) => {
        const prev = all[styleId];
        return prev && prev.index > 0 ? { ...all, [styleId]: { ...prev, index: prev.index - 1, kept: false } } : all;
      }),
    /** The previous outfit was just kept from its page (changed or saved there) rather than swiped. */
    kept: !!current.kept,
    clearKept: () =>
      updateSession((all) => {
        const prev = all[styleId];
        return prev?.kept ? { ...all, [styleId]: { ...prev, kept: false } } : all;
      }),
    retry: () => setErrors((e) => ({ ...e, [styleId]: false })),
  };
}

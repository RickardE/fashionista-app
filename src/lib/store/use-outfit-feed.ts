"use client";

import { useEffect, useRef, useState } from "react";
import { fetchFeedPage, fetchProducts } from "@/lib/api";
import { composeOutfits, type FeedOutfit } from "@/lib/outfit-feed";
import { categoriesForRole, ROLE_DISPLAY_ORDER } from "@/lib/outfits";
import { useCatalog } from "@/lib/store/product-catalog";
import { useStyleProfile } from "@/lib/store/style-profile-context";
import type { Product, ShopperGender } from "@/lib/types";

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
}

/**
 * Composed outfits outlive the Outfits page for the session, so opening an
 * outfit and coming back lands on the same card.
 */
let session: Record<string, StyleOutfits> = {};

export type OutfitFeedStatus = "ready" | "loading" | "error" | "needs_gender";

/**
 * The active style's Outfits feed. Outfits are composed on the client from
 * catalogue products; each style keeps its own position (and anchor cursor,
 * persisted, so a reload continues with new outfits).
 */
export function useOutfitFeed() {
  const { activeStyle, effectiveAffinity, setOutfitCursor } = useStyleProfile();
  const { ingest } = useCatalog();
  const gender = activeStyle.gender;
  // Outfits are kept per style *and* gender: switching gender starts fresh.
  const styleId = `${activeStyle.id}:${gender ?? "-"}`;
  const [byStyle, setByStyle] = useState<Record<string, StyleOutfits>>(() => session);
  useEffect(() => {
    session = byStyle;
  }, [byStyle]);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const inFlight = useRef(new Set<string>());

  const current = byStyle[styleId] ?? { outfits: [], index: 0, recent: [] };
  const remaining = current.outfits.length - current.index;
  const failed = !!errors[styleId];
  const cursor = activeStyle.outfitCursor;

  useEffect(() => {
    if (!gender || failed || remaining >= PREFETCH_AT || inFlight.current.has(styleId)) return;
    inFlight.current.add(styleId);
    const affinity = effectiveAffinity;
    const recent = current.recent;

    fetchFeedPage({ cursor, limit: ANCHOR_PAGE, gender, kind: "outfits" })
      .then(async (page) => {
        const pool = await poolFor(gender);
        ingest([...page.products, ...pool]);
        const composed = composeOutfits(page.products, pool, affinity, recent);
        setByStyle((all) => {
          const prev = all[styleId] ?? { outfits: [], index: 0, recent: [] };
          return {
            ...all,
            [styleId]: { outfits: [...prev.outfits, ...composed.outfits], index: prev.index, recent: composed.recent },
          };
        });
        // At the end of the catalogue, start again from the top.
        setOutfitCursor(activeStyle.id, page.nextCursor ?? undefined);
        setErrors((e) => ({ ...e, [styleId]: false }));
      })
      .catch(() => setErrors((e) => ({ ...e, [styleId]: true })))
      .finally(() => inFlight.current.delete(styleId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleId, gender, failed, remaining, cursor]);

  return {
    outfit: current.outfits[current.index] as FeedOutfit | undefined,
    nextOutfit: current.outfits[current.index + 1] as FeedOutfit | undefined,
    status: (!gender ? "needs_gender" : failed ? "error" : remaining <= 0 ? "loading" : "ready") as OutfitFeedStatus,
    advance: () =>
      setByStyle((all) => {
        const prev = all[styleId];
        return prev ? { ...all, [styleId]: { ...prev, index: prev.index + 1 } } : all;
      }),
    retry: () => setErrors((e) => ({ ...e, [styleId]: false })),
  };
}

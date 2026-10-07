"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFeedPage } from "@/lib/api";
import { useCatalog } from "@/lib/store/product-catalog";
import { useStyleProfile } from "@/lib/store/style-profile-context";

const PAGE_SIZE = 20;
/** Fetch the next page while this many cards are still ahead, so swipes never wait. */
const PREFETCH_AT = 8;

export type FeedStatus = "ready" | "loading" | "error" | "needs_gender";

/**
 * Keeps the active style's feed filled from /api/feed. Each style pages
 * independently (its own position and cursor); the cursor is simply the last
 * product id already in that style's feed.
 */
export function useFeed(): { status: FeedStatus; retry: () => void } {
  const { activeStyle, appendFeed } = useStyleProfile();
  const catalog = useCatalog();
  const { id: styleId, feedOrder, feedIndex, feedExhausted, gender } = activeStyle;
  const inFlight = useRef(new Set<string>());
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const lastId = feedOrder[feedOrder.length - 1];
  const remaining = feedOrder.length - feedIndex;
  const failed = !!errors[styleId];
  const { ingest, ensure } = catalog;

  useEffect(() => {
    if (!gender || feedExhausted || failed || remaining >= PREFETCH_AT) return;
    const key = `${styleId}:${gender}`;
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    // Not aborted on unmount: the page belongs to the style's feed (root
    // store), not to this component.
    fetchFeedPage({ cursor: lastId, limit: PAGE_SIZE, gender, kind: "products" })
      .then((page) => {
        ingest(page.products);
        appendFeed(
          styleId,
          gender,
          page.products.map((p) => p.id),
          page.nextCursor === null,
        );
        setErrors((e) => ({ ...e, [styleId]: false }));
      })
      .catch(() => setErrors((e) => ({ ...e, [styleId]: true })))
      .finally(() => inFlight.current.delete(key));
  }, [gender, feedExhausted, failed, remaining, styleId, lastId, ingest, appendFeed]);

  // After a reload the ids are persisted but the products aren't: resolve the
  // cards around the current position.
  useEffect(() => {
    ensure(feedOrder.slice(feedIndex, feedIndex + 4));
  }, [feedOrder, feedIndex, ensure]);

  const retry = useCallback(() => {
    setErrors((e) => ({ ...e, [styleId]: false }));
    catalog.retry(feedOrder.slice(feedIndex, feedIndex + 4));
  }, [styleId, catalog, feedOrder, feedIndex]);

  // Nothing left to show and more to come means a page is on its way.
  const waiting = remaining <= 0 && !feedExhausted;
  return {
    status: !gender ? "needs_gender" : failed ? "error" : waiting ? "loading" : "ready",
    retry,
  };
}

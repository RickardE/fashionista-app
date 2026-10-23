"use client";

import { useCallback, useState } from "react";
import { useStyleProfile } from "@/lib/store/style-profile-context";

/** One-time tips, each shown the first time the user reaches what it explains. */
export type TipId = "first-pass" | "undo" | "outfits" | "styles";

function read(key: string): Set<TipId> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? "[]") as TipId[]);
  } catch {
    return new Set();
  }
}

/**
 * Which tips this user has seen, remembered per device and account. If
 * storage is unavailable (e.g. a private window) tips simply show again in a
 * later session — nothing depends on them.
 */
export function useTips() {
  const { account } = useStyleProfile();
  const key = `tips-seen:${account?.id ?? "-"}`;
  const [seen, setSeen] = useState(() => read(key));

  const markSeen = useCallback(
    (id: TipId) =>
      setSeen((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev).add(id);
        try {
          localStorage.setItem(key, JSON.stringify([...next]));
        } catch {
          // storage unavailable — remembered for this session only
        }
        return next;
      }),
    [key],
  );

  return { hasSeen: (id: TipId) => seen.has(id), markSeen };
}

/** Asks the bottom nav to draw the eye to the Saved tab, after a save. */
export const SAVED_PULSE_EVENT = "saved-pulse";
export function pulseSavedTab() {
  window.dispatchEvent(new Event(SAVED_PULSE_EVENT));
}

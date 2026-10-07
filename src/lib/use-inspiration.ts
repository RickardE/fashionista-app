"use client";

import { useEffect, useState } from "react";
import { fetchInspiration } from "@/lib/api";
import type { Product, ShopperGender } from "@/lib/types";

export type InspirationTile = { label: string; product: Product };

const cache = new Map<string, Promise<InspirationTile[]>>();

/** Labelled inspiration tiles from the real catalogue, fetched once per session. */
export function useInspiration(gender: ShopperGender | undefined): { tiles: InspirationTile[]; status: "loading" | "ready" | "error"; retry: () => void } {
  const [state, setState] = useState<{ tiles: InspirationTile[]; status: "loading" | "ready" | "error" }>({
    tiles: [],
    status: "loading",
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    const key = gender ?? "any";
    let request = cache.get(key);
    if (!request) {
      request = fetchInspiration(gender).then((r) => r.tiles);
      cache.set(key, request);
    }
    request.then(
      (tiles) => alive && setState({ tiles, status: "ready" }),
      () => {
        cache.delete(key);
        if (alive) setState({ tiles: [], status: "error" });
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt, gender]);

  return {
    ...state,
    retry: () => {
      setState({ tiles: [], status: "loading" });
      setAttempt((a) => a + 1);
    },
  };
}

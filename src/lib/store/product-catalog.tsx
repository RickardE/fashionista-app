"use client";

/**
 * Client-side product cache. Every product the app has received from the API
 * lives here by id, so components can look products up synchronously (as they
 * did with the old mock catalogue) and request missing ones in batches.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { fetchProductsByIds } from "@/lib/api";
import type { Product } from "@/lib/types";

const BATCH_SIZE = 50;

type LoadState = "loading" | "missing" | "error";

interface CatalogValue {
  /** Synchronous lookup of an already-loaded product. */
  get: (id: string) => Product | undefined;
  /** Adds products received from any endpoint (feed, search, ...). */
  ingest: (products: Product[]) => void;
  /** Requests products not yet loaded; batched and de-duplicated. */
  ensure: (ids: string[]) => void;
  stateOf: (id: string) => LoadState | "ready" | "idle";
  /** Clears error/missing marks so `ensure` will try those ids again. */
  retry: (ids: string[]) => void;
  /** Changes whenever the cache does — use as a memo dependency. */
  version: number;
}

const CatalogContext = createContext<CatalogValue | null>(null);

export function ProductCatalogProvider({ children }: { children: React.ReactNode }) {
  const products = useRef(new Map<string, Product>());
  const states = useRef(new Map<string, LoadState>());
  const queue = useRef(new Set<string>());
  const flushScheduled = useRef(false);
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const ingest = useCallback(
    (list: Product[]) => {
      if (!list.length) return;
      for (const p of list) {
        products.current.set(p.id, p);
        states.current.delete(p.id);
      }
      bump();
    },
    [bump],
  );

  const flush = useCallback(async () => {
    flushScheduled.current = false;
    const ids = [...queue.current];
    queue.current.clear();
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      try {
        const { products: found } = await fetchProductsByIds(batch);
        const foundIds = new Set(found.map((p) => p.id));
        for (const p of found) products.current.set(p.id, p);
        for (const id of batch) {
          if (foundIds.has(id)) states.current.delete(id);
          else states.current.set(id, "missing");
        }
      } catch {
        for (const id of batch) states.current.set(id, "error");
      }
      bump();
    }
  }, [bump]);

  const ensure = useCallback(
    (ids: string[]) => {
      let added = false;
      for (const id of ids) {
        if (!id || products.current.has(id) || states.current.has(id)) continue;
        states.current.set(id, "loading");
        queue.current.add(id);
        added = true;
      }
      if (added && !flushScheduled.current) {
        flushScheduled.current = true;
        setTimeout(flush, 0);
      }
    },
    [flush],
  );

  const retry = useCallback(
    (ids: string[]) => {
      for (const id of ids) {
        const s = states.current.get(id);
        if (s === "error" || s === "missing") states.current.delete(id);
      }
      ensure(ids);
    },
    [ensure],
  );

  const value = useMemo<CatalogValue>(
    () => ({
      get: (id) => products.current.get(id),
      ingest,
      ensure,
      retry,
      stateOf: (id) => (products.current.has(id) ? "ready" : (states.current.get(id) ?? "idle")),
      version,
    }),
    [ingest, ensure, retry, version],
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used within ProductCatalogProvider");
  return ctx;
}

export interface ProductsResult {
  /** Loaded products, in the order of the requested ids. */
  products: Product[];
  loading: boolean;
  /** True if any id failed for a reason other than "doesn't exist". */
  error: boolean;
  retry: () => void;
}

/** Resolves a list of product ids through the cache, fetching what's missing. */
export function useProducts(ids: string[]): ProductsResult {
  const catalog = useCatalog();
  const key = ids.join(",");
  const { ensure, retry: retryIds } = catalog;

  useEffect(() => {
    if (key) ensure(key.split(","));
  }, [key, ensure]);

  return useMemo(() => {
    const list = key ? key.split(",") : [];
    const states = list.map((id) => catalog.stateOf(id));
    return {
      products: list.map((id) => catalog.get(id)).filter((p): p is Product => !!p),
      loading: states.some((s) => s === "loading" || s === "idle"),
      error: states.some((s) => s === "error"),
      retry: () => retryIds(list),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, catalog.version, retryIds]);
}

/**
 * One product by id. `initial` (e.g. rendered by a server component) is used
 * immediately and seeded into the cache, so the page doesn't refetch it.
 */
export function useProduct(
  id: string,
  initial?: Product,
): {
  product: Product | undefined;
  status: "loading" | "ready" | "not_found" | "error";
  retry: () => void;
} {
  const catalog = useCatalog();
  const { ingest } = catalog;
  useEffect(() => {
    if (initial && initial.id === id) ingest([initial]);
  }, [initial, id, ingest]);
  const seeded = initial?.id === id ? initial : undefined;
  const { products, retry } = useProducts(seeded ? [] : [id]);
  const state = seeded ? "ready" : catalog.stateOf(id);
  return {
    product: catalog.get(id) ?? seeded ?? products[0],
    status:
      state === "ready" ? "ready" : state === "missing" ? "not_found" : state === "error" ? "error" : "loading",
    retry,
  };
}

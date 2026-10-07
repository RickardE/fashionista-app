/** Typed client for the STYLEAI product API. No fallbacks: failures surface as ApiError. */

import type { Product, ProductCategory, ShopperGender } from "@/lib/types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { signal, headers: { accept: "application/json" } });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError("Can't reach the STYLEAI server", 0);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  }
  return (await res.json()) as T;
}

const qs = (params: Record<string, string | number | undefined>) =>
  new URLSearchParams(
    Object.entries(params).flatMap(([k, v]) => (v === undefined || v === "" ? [] : [[k, String(v)]])),
  ).toString();

export function fetchFeedPage(
  opts: { cursor?: string; limit?: number; gender: ShopperGender; kind: "products" | "outfits" },
  signal?: AbortSignal,
) {
  return get<{ products: Product[]; nextCursor: string | null }>(
    `/api/feed?${qs({ for: opts.kind, gender: opts.gender, cursor: opts.cursor, limit: opts.limit ?? 20 })}`,
    signal,
  );
}

export function fetchProductsByIds(ids: string[], signal?: AbortSignal) {
  return get<{ products: Product[] }>(`/api/products?${qs({ ids: ids.join(",") })}`, signal);
}

export function fetchProducts(
  filter: { categories?: ProductCategory[]; gender?: ShopperGender; exclude?: string[]; limit?: number },
  signal?: AbortSignal,
) {
  return get<{ products: Product[] }>(
    `/api/products?${qs({
      category: filter.categories?.join(","),
      gender: filter.gender,
      exclude: filter.exclude?.join(","),
      limit: filter.limit,
    })}`,
    signal,
  );
}

export function searchProducts(q: string, gender: ShopperGender | undefined, limit = 20, signal?: AbortSignal) {
  return get<{ products: Product[] }>(`/api/search?${qs({ q, gender, limit })}`, signal);
}

export function fetchInspiration(gender: ShopperGender | undefined, signal?: AbortSignal) {
  return get<{ tiles: { label: string; product: Product }[] }>(`/api/inspiration?${qs({ gender })}`, signal);
}

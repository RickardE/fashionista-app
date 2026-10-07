import type {
  CanonicalColor,
  CanonicalProductDraft,
  Category,
  Money,
  NormalizedVariant,
  VariantDraft,
} from "./types";

export interface GroupingResult {
  products: CanonicalProductDraft[];
  /** Rows dropped because another row in the same import had the same externalId. */
  duplicateVariants: number;
}

/** Most common non-empty value; ties resolve to the first seen. */
function mode<T>(values: (T | undefined)[]): T | undefined {
  const counts = new Map<T, number>();
  let best: T | undefined;
  let bestCount = 0;
  for (const v of values) {
    if (v === undefined || v === null || v === "") continue;
    const c = (counts.get(v) ?? 0) + 1;
    counts.set(v, c);
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

function unique<T>(values: (T | undefined)[]): T[] {
  return [...new Set(values.filter((v): v is T => v !== undefined && v !== null && v !== ""))];
}

function longest(values: (string | undefined)[]): string | undefined {
  return values.reduce<string | undefined>(
    (best, v) => (v && (!best || v.length > best.length) ? v : best),
    undefined,
  );
}

function effectivePrice(v: { price?: Money; salePrice?: Money }): Money | undefined {
  return v.salePrice ?? v.price;
}

/** The offer-level headline price: cheapest in-stock variant, else cheapest overall. */
function headlinePrice(variants: NormalizedVariant[]): { price?: Money; salePrice?: Money } {
  const inStock = variants.filter((v) => v.availability === "in_stock");
  const pool = (inStock.length ? inStock : variants).filter((v) => v.price);
  if (!pool.length) return {};
  const cheapest = pool.reduce((a, b) =>
    (effectivePrice(b)?.amountMinor ?? Infinity) < (effectivePrice(a)?.amountMinor ?? Infinity) ? b : a,
  );
  return { price: cheapest.price, salePrice: cheapest.salePrice };
}

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "3XL", "4XL"];

function sizeRank(size: string | undefined): number {
  if (!size) return Number.MAX_SAFE_INTEGER;
  const i = SIZE_ORDER.indexOf(size.toUpperCase());
  if (i >= 0) return i;
  const n = parseFloat(size.replace(",", "."));
  return Number.isFinite(n) ? 100 + n : 10_000;
}

/**
 * Collapses variant rows into canonical products: one product per groupKey,
 * shared facts at product level, size/SKU/GTIN/stock/price at variant level.
 */
export function groupVariants(rows: NormalizedVariant[], merchant: string): GroupingResult {
  const byExternalId = new Map<string, NormalizedVariant>();
  let duplicateVariants = 0;
  for (const row of rows) {
    if (byExternalId.has(row.externalId)) duplicateVariants++;
    byExternalId.set(row.externalId, row); // last occurrence wins
  }

  const groups = new Map<string, NormalizedVariant[]>();
  for (const row of byExternalId.values()) {
    const list = groups.get(row.groupKey);
    if (list) list.push(row);
    else groups.set(row.groupKey, [row]);
  }

  const products: CanonicalProductDraft[] = [];
  for (const [groupKey, variants] of groups) {
    variants.sort((a, b) => sizeRank(a.size) - sizeRank(b.size));

    const category = mode(variants.map((v) => v.category)) as Category;
    const categoryVariant = variants.find((v) => v.category === category);
    const availability = variants.some((v) => v.availability === "in_stock")
      ? "in_stock"
      : (mode(variants.map((v) => v.availability)) ?? "unknown");

    const variantDrafts: VariantDraft[] = variants.map((v) => ({
      externalId: v.externalId,
      size: v.size,
      color: v.color,
      colorRaw: v.colorRaw,
      gtin: v.gtin,
      mpn: v.mpn,
      price: v.price,
      salePrice: v.salePrice,
      availability: v.availability,
      imageUrl: v.images[0],
      productUrl: v.productUrl,
    }));

    products.push({
      name: mode(variants.map((v) => v.title)) ?? variants[0].title,
      description: longest(variants.map((v) => v.description)),
      brand: mode(variants.map((v) => v.brand)),
      category,
      subcategory: categoryVariant?.subcategory,
      gender: mode(variants.map((v) => v.gender)),
      colors: unique<CanonicalColor>(variants.map((v) => v.color)),
      images: unique(variants.flatMap((v) => v.images)),
      attributes: {
        material: mode(variants.map((v) => v.material)),
        pattern: mode(variants.map((v) => v.pattern)),
        colorsRaw: unique(variants.map((v) => v.colorRaw)),
        categoryPaths: unique(variants.flatMap((v) => v.categoryPaths)),
        taxonomyPath: mode(variants.map((v) => v.taxonomyPath)),
      },
      offer: {
        externalGroupKey: groupKey,
        merchant,
        url: mode(variants.map((v) => v.productUrl)),
        ...headlinePrice(variants),
        availability,
        variants: variantDrafts,
      },
    });
  }

  return { products, duplicateVariants };
}

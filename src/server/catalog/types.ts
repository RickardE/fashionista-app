/**
 * Catalog domain types.
 *
 *   ProductSource  ──fetch──▶  RawProduct (one per source row/variant, source vocabulary)
 *                                  │  MappingProfile
 *                                  ▼
 *                           NormalizedVariant (STYLEAI vocabulary)
 *                                  │  group by groupKey
 *                                  ▼
 *                           CanonicalProductDraft (product + one offer + variants)
 *                                  │  persist
 *                                  ▼
 *                           products / offers / variants tables
 *
 * Nothing outside `sources/<provider>/` knows any source's field names.
 */

import type { MappingProfile } from "./mapping/profile";

// ---------------------------------------------------------------------------
// Canonical vocabulary
// ---------------------------------------------------------------------------

export const CANONICAL_COLORS = [
  "black",
  "white",
  "off-white",
  "grey",
  "beige",
  "brown",
  "navy",
  "blue",
  "green",
  "olive",
  "red",
  "burgundy",
  "pink",
  "purple",
  "yellow",
  "orange",
  "multi",
  "silver",
  "gold",
] as const;
export type CanonicalColor = (typeof CANONICAL_COLORS)[number];

export const CATEGORIES = [
  "t-shirts",
  "shirts",
  "polos",
  "knitwear",
  "sweatshirts",
  "outerwear",
  "blazers",
  "suits",
  "waistcoats",
  "trousers",
  "jeans",
  "shorts",
  "dresses",
  "skirts",
  "tops",
  "shoes",
  "bags",
  "accessories",
  "underwear",
  "swimwear",
  "loungewear",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type Gender = "men" | "women" | "unisex";

/** What kind of product something is — the level above category. */
export const PRODUCT_TYPES = ["clothing", "underwear", "swimwear", "loungewear", "shoes", "bags", "accessories", "other"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

const TYPE_BY_CATEGORY: Partial<Record<Category, ProductType>> = {
  underwear: "underwear",
  swimwear: "swimwear",
  loungewear: "loungewear",
  shoes: "shoes",
  bags: "bags",
  // Jewellery, watches, sunglasses, hats, belts, wallets, scarves, ties, ...
  accessories: "accessories",
  other: "other",
};

/** Every category not listed above is a garment. */
export function productTypeFor(category: Category): ProductType {
  return TYPE_BY_CATEGORY[category] ?? "clothing";
}

export type Availability = "in_stock" | "out_of_stock" | "preorder" | "backorder" | "unknown";

export type Condition = "new" | "used" | "refurbished";

/** Money in minor units (öre/cents) to avoid floating-point drift. */
export interface Money {
  amountMinor: number;
  currency: string;
}

// ---------------------------------------------------------------------------
// Source boundary
// ---------------------------------------------------------------------------

export interface SourceIdentity {
  /** Stable machine key for this source, e.g. "adtraction:johnells". */
  key: string;
  /** The integration/network the data comes through, e.g. "adtraction". */
  provider: string;
  /** The retailer selling the product, e.g. "Johnells". */
  merchant: string;
}

/**
 * One row from a source, lifted into a common shape but still in the source's
 * own vocabulary ("Svart", "Man > Kläder > Skjortor"). `raw` keeps the original
 * row verbatim so products can be reprocessed later without refetching.
 */
export interface RawProduct {
  externalId: string;
  /** Source grouping id for variants of the same product (e.g. item_group_id). */
  externalGroupId?: string;
  title: string;
  description?: string;
  /** Category paths as given by the source, most useful first. */
  categoryPaths: string[];
  /** A secondary, standardized taxonomy if the source offers one (e.g. Google). */
  taxonomyPath?: string;
  brand?: string;
  gender?: string;
  ageGroup?: string;
  color?: string;
  material?: string;
  pattern?: string;
  size?: string;
  price?: Money;
  salePrice?: Money;
  availability?: string;
  condition?: string;
  productUrl?: string;
  imageUrl?: string;
  additionalImageUrls: string[];
  gtin?: string;
  mpn?: string;
  raw: Record<string, unknown>;
}

export type RawRowResult =
  | { ok: true; product: RawProduct }
  | { ok: false; index: number; externalId?: string; reason: string };

export interface SourceFetchResult {
  rows: RawRowResult[];
  /** False when the source reported it has not changed since `ifModifiedSince`. */
  modified: boolean;
  meta: {
    fetchedAt: Date;
    lastModified?: Date;
    bytes?: number;
    location?: string;
  };
}

export interface FetchOptions {
  /** Skip the download if the source supports conditional requests and is unchanged. */
  ifModifiedSince?: Date;
  /** Read from a local file instead of the configured remote location. */
  filePath?: string;
  signal?: AbortSignal;
}

/**
 * A product source adapter: retrieves and parses one source into RawProducts.
 * It owns transport + parsing + source field extraction, and nothing else —
 * no normalization decisions beyond what its MappingProfile declares, no
 * recommendation or UI logic.
 */
export interface ProductSource {
  identity: SourceIdentity;
  mapping: MappingProfile;
  fetch(options?: FetchOptions): Promise<SourceFetchResult>;
}

// ---------------------------------------------------------------------------
// Normalized / canonical
// ---------------------------------------------------------------------------

export interface NormalizedVariant {
  externalId: string;
  groupKey: string;
  title: string;
  description?: string;
  brand?: string;
  gender?: Gender;
  category: Category;
  subcategory?: string;
  /** The source category path the category was derived from (or undefined if from title). */
  categorySource?: string;
  categoryPaths: string[];
  taxonomyPath?: string;
  color?: CanonicalColor;
  colorRaw?: string;
  material?: string;
  pattern?: string;
  size?: string;
  price?: Money;
  salePrice?: Money;
  availability: Availability;
  condition: Condition;
  productUrl?: string;
  images: string[];
  gtin?: string;
  mpn?: string;
  raw: Record<string, unknown>;
}

export interface VariantDraft {
  externalId: string;
  size?: string;
  color?: CanonicalColor;
  colorRaw?: string;
  gtin?: string;
  mpn?: string;
  price?: Money;
  salePrice?: Money;
  availability: Availability;
  imageUrl?: string;
  productUrl?: string;
}

export interface OfferDraft {
  externalGroupKey: string;
  merchant: string;
  url?: string;
  price?: Money;
  salePrice?: Money;
  availability: Availability;
  variants: VariantDraft[];
}

/** Source-specific facts kept on the product for enrichment and debugging. */
export interface ProductSourceAttributes {
  material?: string;
  pattern?: string;
  colorsRaw: string[];
  categoryPaths: string[];
  taxonomyPath?: string;
}

export interface CanonicalProductDraft {
  name: string;
  description?: string;
  brand?: string;
  productType: ProductType;
  category: Category;
  subcategory?: string;
  gender?: Gender;
  colors: CanonicalColor[];
  images: string[];
  attributes: ProductSourceAttributes;
  offer: OfferDraft;
}

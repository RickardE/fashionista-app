export type StyleTag =
  | "neutral"
  | "relaxed"
  | "oversized"
  | "wide"
  | "knitwear"
  | "outerwear"
  | "tailoring"
  | "black"
  | "natural"
  | "leather"
  | "shoes"
  | "layer";

export type { Category as ProductCategory, CanonicalColor, Gender, ProductType } from "@/server/catalog/types";
import type { Category, CanonicalColor, Gender, ProductType } from "@/server/catalog/types";

/** Who a Style shops for. Only these two are offered to users; unisex products show for both. */
export type ShopperGender = "men" | "women";

/**
 * A STYLEAI product as the API serves it. Source-agnostic: no feed ids,
 * offers or merchant field names — the backend resolves those.
 */
export interface Product {
  /** Canonical STYLEAI product id. */
  id: string;
  brand: string;
  name: string;
  /** Current price in major units (e.g. SEK), sale price if one applies. */
  price: number;
  currency: string;
  image: string;
  productType: ProductType;
  category: Category;
  subcategory?: string;
  gender?: Gender;
  /** Display label for the main colour, e.g. "Navy". */
  color?: string;
  colors: CanonicalColor[];
  fit?: string;
  material?: string;
  /** Merchant selling the product. */
  retailer: string;
  /** Sizes currently offered, in display order. */
  sizes: string[];
  /** False when sold out or no longer carried — still viewable (saved items). */
  available: boolean;
  /** STYLEAI redirect to the merchant's product page; the backend owns the real URL. */
  shopUrl: string;
  /** Coarse style tags derived from catalogue facts (pre-enrichment heuristic). */
  tags: StyleTag[];
}

/** The role a piece plays in an outfit, independent of its catalog category. */
export type OutfitRole = "outerwear" | "top" | "bottom" | "footwear";

/** A resolved outfit: one product id per role that's filled. */
export type OutfitItems = Partial<Record<OutfitRole, string>>;

export interface Outfit {
  id: string;
  anchorId: string;
  items: OutfitItems;
  styleId: string;
  createdAt: number;
}

/** A starting point for a style: its name, description and initial fashion leaning. */
export interface StylePreset {
  id: string;
  name: string;
  description: string;
  seedAffinity: Partial<Record<StyleTag, number>>;
}

/**
 * One independent style profile — its own learned taste, likes, dislikes and
 * feed order. A user can hold several of these at once (Everyday, Work,
 * Vacation, ...) and switch which one is "active" without the others changing.
 */
export interface StyleProfile {
  id: string;
  name: string;
  description: string;
  seedAffinity: Partial<Record<StyleTag, number>>;
  liked: Record<string, true>;
  disliked: Record<string, true>;
  affinity: Partial<Record<StyleTag, number>>;
  interactions: number;
  /** Product ids loaded into this style's feed so far, in display order. */
  feedOrder: string[];
  feedIndex: number;
  /** True once the API has no more feed pages for this style. */
  feedExhausted: boolean;
  /** Who this style shops for; unset until the user picks Men or Women. */
  gender?: ShopperGender;
  /** Outfit-level taste, learned from the Outfits feed — kept apart from product taste. */
  outfitAffinity: Partial<Record<StyleTag, number>>;
  likedOutfits: number;
  dislikedOutfits: number;
  /** Last catalogue product used as an outfit anchor, so the Outfits feed continues where it left off. */
  outfitCursor?: string;
  showSwipeHint: boolean;
  createdAt: number;
}

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

export type ProductCategory =
  | "Jackets"
  | "Knitwear"
  | "Trousers"
  | "Shirts"
  | "Shoes";

export interface Product {
  id: string;
  brand: string;
  name: string;
  price: number;
  currency: "SEK";
  image: string;
  category: ProductCategory;
  color: string;
  fit: string;
  style: string;
  material: string;
  retailer: string;
  tags: StyleTag[];
  reason: string;
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
  feedOrder: string[];
  feedIndex: number;
  showSwipeHint: boolean;
  createdAt: number;
}

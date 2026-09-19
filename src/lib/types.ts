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

export interface PersonalStyle {
  id: string;
  label: string;
  description: string;
  seedAffinity: Partial<Record<StyleTag, number>>;
}

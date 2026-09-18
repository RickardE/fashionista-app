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

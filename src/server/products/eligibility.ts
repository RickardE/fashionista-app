/**
 * Which products may appear where — the single place these rules live.
 *
 *   Products feed (and Search, inspiration): clothing only, so swipes teach
 *   clothing taste. Underwear, swimwear and loungewear are separate types and never shown.
 *   Outfits: clothing + shoes (top, bottom, outerwear, footwear slots) — this
 *   covers the Outfits feed, Build outfit, Swap and every outfit candidate list.
 *   Shoes stay full catalogue products (own id, product page); they're just not
 *   standalone Products-feed items in v1.
 *
 *   Shopper gender is Men or Women only. Men sees men's + unisex products,
 *   Women sees women's + unisex. Products of unknown gender are left out.
 */

import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import type { ProductType } from "@/server/catalog/types";
import { products } from "@/server/db/schema";

export const SHOPPER_GENDERS = ["men", "women"] as const;
export type ShopperGender = (typeof SHOPPER_GENDERS)[number];

export type FeedKind = "products" | "outfits";

export const TYPES_FOR: Record<FeedKind, ProductType[]> = {
  products: ["clothing"],
  outfits: ["clothing", "shoes"],
};

export function genderCondition(gender: ShopperGender | undefined): SQL | undefined {
  if (!gender) return undefined;
  return or(eq(products.gender, gender), eq(products.gender, "unisex"));
}

export function eligibleFor(kind: FeedKind, gender: ShopperGender | undefined): SQL | undefined {
  return and(inArray(products.productType, TYPES_FOR[kind]), genderCondition(gender));
}

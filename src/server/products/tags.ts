/**
 * Derives the frontend's coarse StyleTags from canonical catalogue facts.
 *
 * This is a deterministic stopgap so the existing Style affinity system keeps
 * working on real products. It only reads facts the catalogue actually has
 * (category, colours, title/description wording) and guesses nothing else.
 * AI enrichment (Milestone 3) replaces it with real attributes.
 */

import type { CanonicalColor, Category } from "@/server/catalog/types";
import type { StyleTag } from "@/lib/types";

const NEUTRAL_COLORS = new Set<CanonicalColor>(["black", "white", "off-white", "grey", "beige", "brown", "navy"]);
const TAILORING = new Set<Category>(["blazers", "suits", "waistcoats"]);
const LAYERS = new Set<Category>(["outerwear", "knitwear", "blazers", "waistcoats"]);

const has = (re: RegExp, ...texts: (string | null | undefined)[]) => texts.some((t) => !!t && re.test(t));

export interface TagInput {
  name: string;
  description?: string | null;
  category: string;
  subcategory?: string | null;
  colors: string[];
}

export function deriveTags(p: TagInput): StyleTag[] {
  const tags = new Set<StyleTag>();
  const category = p.category as Category;
  const colors = p.colors as CanonicalColor[];

  if (colors.includes("black")) tags.add("black");
  if (colors.length && colors.every((c) => NEUTRAL_COLORS.has(c))) tags.add("neutral");
  if (category === "knitwear") tags.add("knitwear");
  if (category === "outerwear") tags.add("outerwear");
  if (category === "shoes") tags.add("shoes");
  if (TAILORING.has(category) || p.subcategory === "suit trousers" || p.subcategory === "dress shirt") {
    tags.add("tailoring");
  }
  if (LAYERS.has(category) || p.subcategory === "overshirt" || p.subcategory === "cardigan") tags.add("layer");

  if (has(/\b(linen|linne|wool|ull|cashmere|kashmir|merino|silk|siden|hemp|hampa)/i, p.name, p.subcategory, p.description)) {
    tags.add("natural");
  }
  if (has(/\b(leather|läder|suede|mocka)/i, p.name, p.description)) tags.add("leather");
  if (has(/\b(relaxed|loose|avslappnad)/i, p.name, p.description)) tags.add("relaxed");
  if (has(/\boversize/i, p.name, p.description)) tags.add("oversized");
  if (has(/\b(wide|vida ben|palazzo)/i, p.name, p.description)) tags.add("wide");

  return [...tags];
}

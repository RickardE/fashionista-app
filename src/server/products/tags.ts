/**
 * Derives the frontend's coarse StyleTags from canonical catalogue facts.
 *
 * Category-based tags always come from catalogue facts. The attribute-based
 * ones (colour, fit, leg, material, tailoring) come from the product's current
 * AI enrichment when it has one; without one, a deterministic stopgap reads
 * the catalogue's colours and title/description wording and guesses nothing
 * else. Either way the tags feed the existing Style affinity system unchanged.
 */

import type { CanonicalColor, Category } from "@/server/catalog/types";
import type { StyleTag } from "@/lib/types";
import type { StoredEnrichment } from "./enrichment";

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

const NEUTRAL_PROFILES = new Set(["neutral_dark", "neutral_light", "earth"]);
const NATURAL_MATERIALS = new Set(["linen", "wool", "cashmere", "silk"]);
const LEATHER_MATERIALS = new Set(["leather", "suede"]);
const TAILORED_TYPES = new Set(["blazer", "suit", "waistcoat", "tailored_trousers", "dress_shirt"]);
const LAYER_TYPES = new Set(["overshirt", "cardigan", "gilet", "knit_vest"]);

function categoryTags(p: TagInput, tags: Set<StyleTag>) {
  const category = p.category as Category;
  if (category === "knitwear") tags.add("knitwear");
  if (category === "outerwear") tags.add("outerwear");
  if (category === "shoes") tags.add("shoes");
  if (TAILORING.has(category) || p.subcategory === "suit trousers" || p.subcategory === "dress shirt") {
    tags.add("tailoring");
  }
  if (LAYERS.has(category) || p.subcategory === "overshirt" || p.subcategory === "cardigan") tags.add("layer");
}

export function deriveTags(p: TagInput, enrichment?: StoredEnrichment): StyleTag[] {
  const tags = new Set<StyleTag>();
  categoryTags(p, tags);
  if (enrichment) {
    const e = enrichment.summary;
    if (e.colourPrimary === "black") tags.add("black");
    if (NEUTRAL_PROFILES.has(e.colourProfile)) tags.add("neutral");
    if (TAILORED_TYPES.has(e.garmentType) || e.formality >= 4) tags.add("tailoring");
    if (LAYER_TYPES.has(e.garmentType)) tags.add("layer");
    if (enrichment.materials.some((m) => NATURAL_MATERIALS.has(m))) tags.add("natural");
    if (enrichment.materials.some((m) => LEATHER_MATERIALS.has(m))) tags.add("leather");
    if (e.fit === "relaxed") tags.add("relaxed");
    if (e.fit === "oversized") tags.add("oversized");
    if (e.legShape === "wide" || e.garmentType === "wide_trousers") tags.add("wide");
    return [...tags];
  }

  const colors = p.colors as CanonicalColor[];
  if (colors.includes("black")) tags.add("black");
  if (colors.length && colors.every((c) => NEUTRAL_COLORS.has(c))) tags.add("neutral");
  if (has(/\b(linen|linne|wool|ull|cashmere|kashmir|merino|silk|siden|hemp|hampa)/i, p.name, p.subcategory, p.description)) {
    tags.add("natural");
  }
  if (has(/\b(leather|läder|suede|mocka)/i, p.name, p.description)) tags.add("leather");
  if (has(/\b(relaxed|loose|avslappnad)/i, p.name, p.description)) tags.add("relaxed");
  if (has(/\boversize/i, p.name, p.description)) tags.add("oversized");
  if (has(/\b(wide|vida ben|palazzo)/i, p.name, p.description)) tags.add("wide");

  return [...tags];
}

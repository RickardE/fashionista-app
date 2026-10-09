/**
 * Validation of model output against the taxonomy and the product it describes.
 *
 *   1. Schema   — types and enum membership (Zod). Failure → retry once → failed.
 *   2. Normalize — drop low-confidence multi-value labels, dedupe, enforce
 *                  cardinality limits. Never fails; records what it changed.
 *   3. Rules    — hard rules (product-level concerns → needs_review) kept apart
 *                 from soft warnings (recorded, never block).
 */

import type { CanonicalColor, Category } from "@/server/catalog/types";
import {
  garmentTypeFitsCategory,
  MAX_AESTHETICS,
  MAX_SECONDARY_COLOURS,
  MAX_SUMMARY_LENGTH,
  MAX_TAXONOMY_GAPS,
  ModelOutputSchema,
  type Confidence,
  type EnrichmentAttributes,
  type EnrichmentConfidences,
  type ModelOutput,
} from "./taxonomy";

export interface Finding {
  code: string;
  message: string;
}

export interface ValidationContext {
  category: string;
  productType: string;
  /** Canonical source colours, for the colour-agreement warning. */
  sourceColours: string[];
}

export type ValidationResult =
  | { ok: false; schemaErrors: string[] }
  | {
      ok: true;
      attributes: EnrichmentAttributes;
      confidences: EnrichmentConfidences;
      /** Hard rule violations — the product needs a human look. */
      errors: Finding[];
      warnings: Finding[];
      /** Labels removed during normalization, e.g. "aesthetics:edgy(low)". */
      dropped: string[];
    };

export function parseModelOutput(output: unknown): { ok: true; value: ModelOutput } | { ok: false; errors: string[] } {
  const parsed = ModelOutputSchema.safeParse(output);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.slice(0, 20).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
const byConfidence = <T extends { confidence: Confidence }>(a: T, b: T) => RANK[b.confidence] - RANK[a.confidence];

/** Keeps the first occurrence of each value. */
function dedupe<T extends { value: unknown }>(items: T[]): T[] {
  const seen = new Set<unknown>();
  return items.filter((i) => (seen.has(i.value) ? false : (seen.add(i.value), true)));
}

/** Colours a model may reasonably see where the source names another one. */
const NEAR_COLOURS: Partial<Record<CanonicalColor, CanonicalColor[]>> = {
  black: ["navy", "grey"],
  navy: ["black", "blue"],
  blue: ["navy"],
  grey: ["black", "silver", "white", "off-white"],
  white: ["off-white", "grey", "silver"],
  "off-white": ["white", "beige", "grey"],
  beige: ["off-white", "brown", "yellow"],
  brown: ["beige", "olive", "burgundy"],
  olive: ["green", "brown"],
  green: ["olive"],
  red: ["burgundy", "orange", "pink"],
  burgundy: ["red", "brown", "purple"],
  pink: ["red", "purple"],
  purple: ["pink", "burgundy"],
  yellow: ["beige", "orange", "gold"],
  orange: ["red", "yellow"],
  silver: ["grey", "white"],
  gold: ["yellow", "beige"],
};

export function coloursAgree(aiColour: CanonicalColor, sourceColours: string[]): boolean {
  if (!sourceColours.length || sourceColours.includes("multi") || aiColour === "multi") return true;
  if (sourceColours.includes(aiColour)) return true;
  return (NEAR_COLOURS[aiColour] ?? []).some((c) => sourceColours.includes(c));
}

export function validateOutput(output: unknown, ctx: ValidationContext): ValidationResult {
  const parsed = parseModelOutput(output);
  if (!parsed.ok) return { ok: false, schemaErrors: parsed.errors };
  const o = parsed.value;

  const dropped: string[] = [];
  const warnings: Finding[] = [];
  const errors: Finding[] = [];
  /** `keepBestLow`: when every label is low, keep the first (the model's best) instead of none. */
  const keep = <T extends { value: string; confidence: Confidence }>(field: string, items: T[], max = Infinity, keepBestLow = false) => {
    const unique = dedupe(items);
    const best = keepBestLow && unique.length && unique.every((i) => i.confidence === "low") ? unique[0] : undefined;
    const kept = unique.filter((i) => {
      if (i.confidence !== "low" || i === best) return true;
      dropped.push(`${field}:${i.value}(low)`);
      return false;
    });
    kept.sort(byConfidence);
    for (const extra of kept.slice(max)) dropped.push(`${field}:${extra.value}(over limit)`);
    return kept.slice(0, max);
  };

  // --- normalize -----------------------------------------------------------
  const materials = keep("materials", o.materials);
  // Since gate 1.2.0 a weak style signal is kept (and noted by the gate) rather than erased.
  const aesthetics = keep("aesthetics", o.aesthetics, MAX_AESTHETICS, true);
  if (o.aesthetics.length > MAX_AESTHETICS) {
    warnings.push({ code: "aesthetics_over_limit", message: `${o.aesthetics.length} aesthetics returned; kept ${MAX_AESTHETICS}` });
  }
  const occasions = keep("occasions", o.occasions);

  const secondary = [...new Set(o.colour_secondary)].filter((c) => c !== o.colour_primary.value);
  if (secondary.length > MAX_SECONDARY_COLOURS) {
    dropped.push(...secondary.slice(MAX_SECONDARY_COLOURS).map((c) => `colour_secondary:${c}(over limit)`));
  }
  const seasons = [...new Set(o.seasons.values)];
  const issues = [...new Set(o.issues)];

  let summary = o.summary.replace(/\s+/g, " ").trim();
  if (summary.length > MAX_SUMMARY_LENGTH) {
    warnings.push({ code: "summary_truncated", message: `summary was ${summary.length} characters` });
    const cut = summary.slice(0, MAX_SUMMARY_LENGTH);
    summary = `${cut.slice(0, Math.max(cut.lastIndexOf(" "), MAX_SUMMARY_LENGTH - 20)).trimEnd()}…`;
  }

  const suggested = o.category_check.verdict === "disagrees" ? o.category_check.suggested_category : null;

  const attributes: EnrichmentAttributes = {
    garment_type: o.garment_type.value,
    fit: o.fit.value,
    colour_primary: o.colour_primary.value,
    colour_secondary: secondary.slice(0, MAX_SECONDARY_COLOURS),
    colour_profile: o.colour_profile.value,
    pattern: o.pattern.value,
    materials: materials.map(({ value, evidence }) => ({ value, evidence })),
    aesthetics: aesthetics.map((a) => a.value),
    formality: o.formality.value,
    occasions: occasions.map((a) => a.value),
    seasons,
    category_check: { verdict: o.category_check.verdict, suggested_category: suggested },
    issues,
    summary,
    taxonomy_gaps: o.taxonomy_gaps.map((g) => g.trim()).filter(Boolean).slice(0, MAX_TAXONOMY_GAPS),
  };
  const confidences: EnrichmentConfidences = {
    garment_type: o.garment_type.confidence,
    fit: o.fit.confidence,
    colour_primary: o.colour_primary.confidence,
    colour_profile: o.colour_profile.confidence,
    pattern: o.pattern.confidence,
    formality: o.formality.confidence,
    seasons: o.seasons.confidence,
    category_check: o.category_check.confidence,
    materials: Object.fromEntries(materials.map((m) => [m.value, m.confidence])),
    aesthetics: Object.fromEntries(aesthetics.map((a) => [a.value, a.confidence])),
    occasions: Object.fromEntries(occasions.map((a) => [a.value, a.confidence])),
  };

  // --- hard rules (→ needs_review) -----------------------------------------
  const category = ctx.category as Category;
  const isShoe = ctx.productType === "shoes" || category === "shoes";
  if (attributes.garment_type === "other") {
    errors.push({ code: "garment_type_other", message: "no garment type fits" });
  } else if (!garmentTypeFitsCategory(attributes.garment_type, category)) {
    errors.push({
      code: "category_mismatch",
      message: `garment_type ${attributes.garment_type} is inconsistent with category ${ctx.category}`,
    });
  }
  if (isShoe && attributes.fit !== "not_applicable") {
    errors.push({ code: "shoe_fit", message: `shoes must have fit not_applicable (got ${attributes.fit})` });
  }
  if (!isShoe && attributes.fit === "not_applicable") {
    errors.push({ code: "garment_fit_not_applicable", message: "garments need a fit" });
  }
  if (suggested === ctx.category) {
    warnings.push({ code: "category_check_self", message: "disagreed but suggested the same category" });
  }

  // --- soft warnings --------------------------------------------------------
  if (attributes.formality === 5 && attributes.aesthetics.includes("streetwear")) {
    warnings.push({ code: "formal_streetwear", message: "formality 5 with a streetwear aesthetic" });
  }
  if (attributes.formality === 1 && attributes.occasions.includes("work")) {
    warnings.push({ code: "lounge_for_work", message: "formality 1 tagged for work" });
  }
  const winterOnly = seasons.length === 1 && seasons[0] === "winter";
  const summerOnly = seasons.length === 1 && seasons[0] === "summer";
  if (winterOnly && ["shorts", "tank", "sandals"].includes(attributes.garment_type)) {
    warnings.push({ code: "summer_item_winter_only", message: `${attributes.garment_type} tagged winter-only` });
  }
  if (summerOnly && ["puffer", "parka", "coat", "boots"].includes(attributes.garment_type)) {
    warnings.push({ code: "winter_item_summer_only", message: `${attributes.garment_type} tagged summer-only` });
  }
  if (summerOnly && attributes.materials.some((m) => m.value === "down" || m.value === "cashmere")) {
    warnings.push({ code: "warm_material_summer_only", message: "down/cashmere tagged summer-only" });
  }
  if (!coloursAgree(attributes.colour_primary, ctx.sourceColours)) {
    warnings.push({
      code: "colour_disagrees_with_source",
      message: `AI primary colour ${attributes.colour_primary} vs source ${ctx.sourceColours.join("/")}`,
    });
  }

  return { ok: true, attributes, confidences, errors, warnings, dropped };
}

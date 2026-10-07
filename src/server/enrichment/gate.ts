/**
 * The quality gate: decides whether a validated enrichment is good enough to
 * become a product's active, recommendation-ready description.
 *
 *   completed     all required attributes present with ≥ medium confidence,
 *                 no hard-rule violations, no blocking issues
 *   needs_review  usable output with a concern a human should look at
 *   failed        no usable output (decided before the gate; see pipeline)
 */

import type { EnrichmentAttributes, EnrichmentConfidences, Issue } from "./taxonomy";
import type { Finding } from "./validate";

export type GateOutcome = "completed" | "needs_review";

export interface GateResult {
  outcome: GateOutcome;
  /** Machine-readable reasons, e.g. "low_confidence:fit", "issue:image_unclear". */
  reasons: string[];
}

/** Single-value attributes that must exist with at least medium confidence. */
const REQUIRED_SCORED = ["garment_type", "fit", "colour_primary", "pattern", "formality"] as const;
/** Multi-value attributes that need at least one label left after low-confidence labels are dropped. */
const REQUIRED_LISTS = ["occasions", "seasons", "aesthetics"] as const;
/** Issues that do not block on their own. */
const NON_BLOCKING_ISSUES: readonly Issue[] = ["low_information"];

export function applyGate(input: {
  attributes: EnrichmentAttributes;
  confidences: EnrichmentConfidences;
  errors: Finding[];
}): GateResult {
  const { attributes, confidences, errors } = input;
  const reasons: string[] = [];

  for (const field of REQUIRED_SCORED) {
    if (attributes[field] === undefined || attributes[field] === null) reasons.push(`missing_required:${field}`);
    else if (confidences[field] === "low") reasons.push(`low_confidence:${field}`);
  }
  for (const field of REQUIRED_LISTS) {
    if (!attributes[field].length) reasons.push(`missing_required:${field}`);
  }
  if (attributes.seasons.length && confidences.seasons === "low") reasons.push("low_confidence:seasons");

  if (attributes.category_check.verdict === "disagrees" && confidences.category_check !== "low") {
    reasons.push("category_disagrees");
  }
  for (const issue of attributes.issues) {
    if (!NON_BLOCKING_ISSUES.includes(issue)) reasons.push(`issue:${issue}`);
  }
  for (const error of errors) reasons.push(`rule:${error.code}`);

  return { outcome: reasons.length ? "needs_review" : "completed", reasons };
}

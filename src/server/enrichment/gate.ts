/**
 * The quality gate: decides whether a validated enrichment is good enough to
 * become a product's active, recommendation-ready description.
 *
 *   completed     all required attributes present with ≥ medium confidence
 *                 (fit and aesthetics may be low: noted, not blocking), no
 *                 hard-rule violations, no blocking issues
 *   needs_review  usable output with a concern a human should look at
 *   failed        no usable output (decided before the gate; see pipeline)
 */

import type { EnrichmentAttributes, EnrichmentConfidences, Issue } from "./taxonomy";
import type { Finding } from "./validate";

/**
 * Bumped whenever the gate's rules change, and recorded on every run and
 * attempt, so stored outcomes stay attributable to the rules that produced them.
 *   1.0.0  initial gate
 *   1.1.0  low-confidence fit no longer blocks (pilot review: 12/12 checked low-
 *          confidence fit values were correct; fit is hard to see on packshots)
 *   1.2.0  aesthetics whose labels are all low-confidence no longer block: the
 *          validator keeps the best label with its low confidence (until 1.1.0
 *          it was dropped, leaving the list empty) and the gate notes it.
 *          An empty aesthetics list still blocks. (Run 6: the stricter 1.1
 *          definitions made the model honest about weak style signals; one
 *          dropped label was the one the reviewer had chosen.)
 */
export const GATE_VERSION = "1.2.0";

export type GateOutcome = "completed" | "needs_review";

export interface GateResult {
  outcome: GateOutcome;
  /** Machine-readable reasons, e.g. "low_confidence:fit", "issue:image_unclear". */
  reasons: string[];
  /** Non-blocking observations kept for review and ranking, e.g. "low_confidence:fit". */
  notes: string[];
}

/** Single-value attributes that must exist with at least medium confidence. */
const REQUIRED_SCORED = ["garment_type", "fit", "colour_primary", "pattern", "formality"] as const;
/**
 * Required fields whose low confidence is noted but does not block: the value
 * is still required, and its stored confidence lets ranking weight it less.
 */
const ADVISORY_LOW_CONFIDENCE: readonly (typeof REQUIRED_SCORED)[number][] = ["fit"];
/** Multi-value attributes that need at least one label left after low-confidence labels are dropped. */
const REQUIRED_LISTS = ["occasions", "seasons", "aesthetics"] as const;
/** Lists the validator keeps a low-confidence best label for; the gate notes it instead of blocking. */
const ADVISORY_LOW_CONFIDENCE_LISTS = ["aesthetics"] as const;
/** Issues that do not block on their own. */
const NON_BLOCKING_ISSUES: readonly Issue[] = ["low_information"];

export function applyGate(input: {
  attributes: EnrichmentAttributes;
  confidences: EnrichmentConfidences;
  errors: Finding[];
}): GateResult {
  const { attributes, confidences, errors } = input;
  const reasons: string[] = [];
  const notes: string[] = [];

  for (const field of REQUIRED_SCORED) {
    if (attributes[field] === undefined || attributes[field] === null) reasons.push(`missing_required:${field}`);
    else if (confidences[field] === "low") {
      (ADVISORY_LOW_CONFIDENCE.includes(field) ? notes : reasons).push(`low_confidence:${field}`);
    }
  }
  for (const field of REQUIRED_LISTS) {
    if (!attributes[field].length) reasons.push(`missing_required:${field}`);
  }
  for (const field of ADVISORY_LOW_CONFIDENCE_LISTS) {
    const labels = attributes[field];
    const conf = confidences[field] as Partial<Record<string, string>>;
    if (labels.length && labels.every((l) => conf[l] === "low")) notes.push(`low_confidence:${field}`);
  }
  if (attributes.seasons.length && confidences.seasons === "low") reasons.push("low_confidence:seasons");

  if (attributes.category_check.verdict === "disagrees" && confidences.category_check !== "low") {
    reasons.push("category_disagrees");
  }
  for (const issue of attributes.issues) {
    if (!NON_BLOCKING_ISSUES.includes(issue)) reasons.push(`issue:${issue}`);
  }
  for (const error of errors) reasons.push(`rule:${error.code}`);

  return { outcome: reasons.length ? "needs_review" : "completed", reasons, notes };
}

export const GATE_VERSIONS = ["1.0.0", "1.1.0", "1.2.0"] as const;
export type GateVersion = (typeof GATE_VERSIONS)[number];

/**
 * Re-evaluates a stored result under a given gate version, so run comparisons
 * can separate what a gate change did from what better predictions did.
 *   1.1.0  a low-only aesthetics list counts as missing (the old validator
 *          dropped every low label)
 *   1.0.0  as 1.1.0, and low-confidence fit blocks too
 */
export function applyGateAs(version: GateVersion, input: Parameters<typeof applyGate>[0]): GateResult {
  const gate = applyGate(input);
  if (version === "1.2.0") return gate;
  const asReason: Record<string, string> = { "low_confidence:aesthetics": "missing_required:aesthetics" };
  if (version === "1.0.0") asReason["low_confidence:fit"] = "low_confidence:fit";
  const reasons = [...gate.reasons, ...gate.notes.filter((n) => asReason[n]).map((n) => asReason[n])];
  const notes = gate.notes.filter((n) => !asReason[n]);
  return { outcome: reasons.length ? "needs_review" : "completed", reasons, notes };
}

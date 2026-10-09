import { describe, expect, it } from "vitest";
import { compareRuns, comparisonMarkdown, parseDecisions } from "../compare";
import { applyGateAs } from "../gate";
import type { loadReviewData } from "../review";
import { validateOutput } from "../validate";
import { modelOutput } from "./fixtures";

type ReviewData = Awaited<ReturnType<typeof loadReviewData>>;
type Override = Parameters<typeof modelOutput>[0];

const BASE = 4;
const NEXT = 6;
const OTHER = 5;

/** A stored attempt as the given run's gate would have recorded it. */
function attempt(runId: number, productId: string, override: Override = {}, extra: { category?: string; hash?: string } = {}) {
  const category = extra.category ?? "shirts";
  const v = validateOutput(modelOutput(override), { category, productType: "clothing", sourceColours: ["navy"] });
  if (!v.ok) throw new Error("invalid fixture");
  const gate = applyGateAs(runId === NEXT ? "1.1.0" : "1.0.0", v);
  return {
    runId,
    productId,
    outcome: gate.outcome,
    attributes: v.attributes,
    confidences: v.confidences,
    validation: { errors: v.errors, warnings: v.warnings, dropped: v.dropped, gateReasons: gate.reasons },
    error: null,
    latencyMs: runId === NEXT ? 2000 : 1000,
    costUsdMicros: 30_000,
    inputTokens: 100,
    outputTokens: 10,
    imageUrl: null,
    input: { product: { category } },
    inputContentHash: extra.hash ?? "h",
    currentContentHash: "h",
    currentCategory: category,
    name: productId,
    description: null,
    brand: null,
    category,
    subcategory: null,
    gender: "men",
    colors: ["navy"],
    sourceAttributes: { colorsRaw: [], categoryPaths: [] },
  };
}

const data = (rows: ReturnType<typeof attempt>[]) =>
  ({
    runs: [
      { id: BASE, provider: "anthropic", model: "claude-opus-5-5", effort: "low", taxonomyVersion: "1.0.0", promptVersion: "1.0.0", params: {} },
      { id: OTHER, provider: "anthropic", model: "claude-sonnet-5-5", effort: "low", taxonomyVersion: "1.0.0", promptVersion: "1.0.0", params: {} },
      { id: NEXT, provider: "anthropic", model: "claude-opus-5-5", effort: "low", taxonomyVersion: "1.1.0", promptVersion: "1.1.0", params: { gateVersion: "1.1.0" } },
    ],
    rows,
  }) as unknown as ReviewData;

const lowFit = { fit: { value: "regular" as const, confidence: "low" as const } };
const lowPattern = { pattern: { value: "solid" as const, confidence: "low" as const } };

describe("compareRuns", () => {
  it("attributes a review → completed change to the gate when the base output would now pass", () => {
    const c = compareRuns(data([attempt(BASE, "fit", lowFit), attempt(NEXT, "fit", lowFit)]), BASE, NEXT);
    expect(c.transitions).toEqual([expect.objectContaining({ productId: "fit", from: "needs_review", to: "completed", cause: "gate" })]);
    expect(c.outcomeMatrix).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ run: BASE, gate: "1.0.0", completed: 0, needsReview: 1 }),
        expect.objectContaining({ run: BASE, gate: "1.1.0", completed: 1, needsReview: 0 }),
      ]),
    );
  });

  it("attributes it to the prediction when the base output would still need review", () => {
    const c = compareRuns(data([attempt(BASE, "p", lowPattern), attempt(NEXT, "p")]), BASE, NEXT);
    expect(c.transitions[0]).toMatchObject({ cause: "prediction", baseReasons: ["low_confidence:pattern"], nextReasons: [] });
    expect(c.confidence.find((s) => s.field === "pattern")).toMatchObject({ up: 1, baseLow: 1, nextLow: 0 });
  });

  it("reports regressions and flags products whose input changed", () => {
    const c = compareRuns(data([attempt(BASE, "r"), attempt(NEXT, "r", lowPattern, { hash: "changed" })]), BASE, NEXT);
    expect(c.transitions[0]).toMatchObject({ cause: "regression", inputChanged: true });
    expect(c.inputChanged).toEqual(["r"]);
    expect(c.reasons).toEqual([{ reason: "low_confidence:pattern", base: 0, next: 1 }]);
  });

  it("compares category checks by the category the model believes, across a catalogue fix", () => {
    const before = attempt(BASE, "k", { category_check: { verdict: "disagrees", suggested_category: "tops", confidence: "high" }, garment_type: { value: "top", confidence: "high" } }, { category: "knitwear" });
    const after = attempt(NEXT, "k", { garment_type: { value: "top", confidence: "high" } }, { category: "tops", hash: "fixed" });
    const c = compareRuns(data([before, after]), BASE, NEXT);
    expect(c.fields.find((f) => f.field === "category_check")).toMatchObject({ same: 1, changed: [] });
    expect(c.transitions[0]).toMatchObject({ from: "needs_review", to: "completed", cause: "prediction", inputChanged: true });
  });

  it("judges colour profiles by the 1.1 colour families even for runs made before the rule", () => {
    const grey = { colour_primary: { value: "grey" as const, confidence: "high" as const } };
    const c = compareRuns(
      data([
        attempt(BASE, "g", { ...grey, colour_profile: { value: "muted", confidence: "medium" } }),
        attempt(NEXT, "g", { ...grey, colour_profile: { value: "neutral_light", confidence: "medium" } }),
      ]),
      BASE,
      NEXT,
    );
    expect(c.signals.find((s) => s.signal.startsWith("colour profile"))).toMatchObject({ base: 1, next: 0 });
  });

  it("skips fields the base run's taxonomy did not have", () => {
    const old = attempt(BASE, "j");
    delete (old.attributes as { leg_shape?: string }).leg_shape;
    const c = compareRuns(data([old, attempt(NEXT, "j")]), BASE, NEXT);
    expect(c.fields.find((f) => f.field === "leg_shape")).toMatchObject({ compared: 0, changed: [] });
  });

  it("scores the new run against human decisions", () => {
    const rows = [
      attempt(BASE, "a", { pattern: { value: "stripe", confidence: "medium" } }),
      attempt(OTHER, "a", { pattern: { value: "print", confidence: "medium" } }),
      attempt(NEXT, "a", { pattern: { value: "stripe", confidence: "high" } }),
      attempt(BASE, "b", { pattern: { value: "check", confidence: "low" } }),
      attempt(OTHER, "b", { pattern: { value: "texture", confidence: "low" } }),
      attempt(NEXT, "b", { pattern: { value: "solid", confidence: "medium" } }),
      attempt(BASE, "c", { aesthetics: [{ value: "classic", confidence: "medium" }] }),
      attempt(OTHER, "c", { aesthetics: [{ value: "streetwear", confidence: "medium" }] }),
      attempt(NEXT, "c", { aesthetics: [{ value: "classic", confidence: "medium" }] }),
    ];
    const decisions = parseDecisions(
      '"product_id","field","decision"\n"a","pattern","A"\n"b","pattern","neither"\n"c","aesthetics","B"\n"d","fit",""\n',
    );
    expect(decisions).toHaveLength(3);
    const c = compareRuns(data(rows), BASE, NEXT, { decisions, decisionRuns: [BASE, OTHER] });
    expect(c.decisions?.byVerdict).toEqual({ accepted: 1, rejected: 1, new_value: 1, missing: 0 });
    expect(c.decisions?.items.find((i) => i.productId === "b")).toMatchObject({ rejected: ["check", "texture"], next: "solid", verdict: "new_value" });
  });

  it("renders cost, latency, the gate replay and decisions", () => {
    const md = comparisonMarkdown(compareRuns(data([attempt(BASE, "fit", lowFit), attempt(NEXT, "fit", lowFit)]), BASE, NEXT));
    expect(md).toContain("# Run #4 vs run #6");
    expect(md).toContain("| 1.0.0 | 0 / 1 | 0 / 1 |");
    expect(md).toContain("| 1.1.0 | 1 / 0 | 1 / 0 |");
    expect(md).toContain("Review → completed because of the gate alone: 1");
    expect(md).toContain("$0.0300");
  });
});

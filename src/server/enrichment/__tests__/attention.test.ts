import { describe, expect, it } from "vitest";
import { attentionHtml, attentionReport } from "../attention";
import type { loadReviewData } from "../review";
import { validateOutput } from "../validate";
import { modelOutput } from "./fixtures";

type ReviewData = Awaited<ReturnType<typeof loadReviewData>>;
type Override = Parameters<typeof modelOutput>[0];

function attempt(runId: number, productId: string, override: Override = {}, extra: { category?: string; currentCategory?: string } = {}) {
  const category = extra.category ?? "shirts";
  const v = validateOutput(modelOutput(override), { category, productType: category === "shoes" ? "shoes" : "clothing", sourceColours: ["navy"] });
  if (!v.ok) throw new Error("invalid fixture");
  return {
    runId,
    productId,
    outcome: "completed",
    attributes: v.attributes,
    confidences: v.confidences,
    validation: { errors: v.errors, warnings: v.warnings, dropped: v.dropped, gateReasons: [] },
    error: null,
    latencyMs: 1,
    costUsdMicros: 1,
    inputTokens: 1,
    outputTokens: 1,
    imageUrl: `https://img.example/${productId}.jpg`,
    input: { product: { category } },
    inputContentHash: "h",
    currentContentHash: extra.currentCategory ? "changed" : "h",
    currentCategory: extra.currentCategory ?? category,
    name: `Product ${productId}`,
    description: null,
    brand: "Brand",
    category: extra.currentCategory ?? category,
    subcategory: null,
    gender: "men",
    colors: ["navy"],
    sourceAttributes: { colorsRaw: [], categoryPaths: [] },
  };
}

const data = (rows: ReturnType<typeof attempt>[]) =>
  ({
    runs: [
      { id: 1, model: "claude-opus-5-5" },
      { id: 2, model: "claude-sonnet-5-5" },
    ],
    rows,
  }) as unknown as ReviewData;

const itemsFor = (rows: ReturnType<typeof attempt>[], id: string) =>
  attentionReport(data(rows), 1, 2).products.find((p) => p.productId === id)?.items ?? [];

describe("attention report", () => {
  it("lists nothing when the models agree confidently", () => {
    const report = attentionReport(data([attempt(1, "a"), attempt(2, "a")]), 1, 2);
    expect(report.products).toEqual([]);
    expect(report.clean).toEqual(["Brand Product a"]);
    expect(report.fields.find((f) => f.field === "formality")).toMatchObject({ identical: 1, flagged: 0 });
  });

  it("flags garment-type disagreements with both values and confidences", () => {
    const items = itemsFor([attempt(1, "a"), attempt(2, "a", { garment_type: { value: "casual_shirt", confidence: "medium" } })], "a");
    expect(items).toEqual([
      expect.objectContaining({
        field: "garment_type",
        severity: "medium",
        a: { value: "oxford_shirt", confidence: "high" },
        b: { value: "casual_shirt", confidence: "medium" },
      }),
    ]);
  });

  it("treats a shared category disagreement as a likely catalogue error, without repeating its rule violations", () => {
    const wrong = { category_check: { verdict: "disagrees" as const, suggested_category: "jeans" as const, confidence: "high" as const }, garment_type: { value: "jeans" as const, confidence: "high" as const }, leg_shape: { value: "straight" as const, confidence: "medium" as const }, colour_primary: { value: "blue" as const, confidence: "high" as const }, colour_profile: { value: "neutral_dark" as const, confidence: "high" as const } };
    const items = itemsFor([attempt(1, "a", wrong, { category: "shoes" }), attempt(2, "a", wrong, { category: "shoes" })], "a");
    expect(items.map((i) => [i.field, i.severity])).toEqual([["category_check", "high"]]);
    expect(items[0].reason).toMatch(/not shoes — likely catalogue error/);
  });

  it("downgrades a category disagreement the catalogue has since fixed", () => {
    const wrong = { category_check: { verdict: "disagrees" as const, suggested_category: "jeans" as const, confidence: "high" as const }, garment_type: { value: "jeans" as const, confidence: "high" as const }, leg_shape: { value: "straight" as const, confidence: "medium" as const }, colour_primary: { value: "blue" as const, confidence: "high" as const }, colour_profile: { value: "neutral_dark" as const, confidence: "high" as const } };
    const report = attentionReport(
      data([attempt(1, "a", wrong, { category: "shoes", currentCategory: "jeans" }), attempt(2, "a", wrong, { category: "shoes", currentCategory: "jeans" })]),
      1,
      2,
    );
    expect(report.products[0].items).toEqual([expect.objectContaining({ field: "category_check", severity: "low" })]);
    expect(report.products[0].changedSince).toMatch(/category now jeans/);
  });

  it("marks agreeing low-confidence values as a quick check, not a decision", () => {
    const low = { fit: { value: "regular" as const, confidence: "low" as const } };
    const items = itemsFor([attempt(1, "a", low), attempt(2, "a", { fit: { value: "regular", confidence: "medium" } })], "a");
    expect(items).toEqual([expect.objectContaining({ field: "fit", severity: "low" })]);
  });

  it("ignores partially overlapping multi-label fields but flags disjoint ones", () => {
    const partial = itemsFor([attempt(1, "a"), attempt(2, "a", { aesthetics: [{ value: "classic", confidence: "high" }] })], "a");
    expect(partial).toEqual([]);
    const disjoint = itemsFor([attempt(1, "b"), attempt(2, "b", { aesthetics: [{ value: "streetwear", confidence: "high" }] })], "b");
    expect(disjoint).toEqual([expect.objectContaining({ field: "aesthetics", reason: "no label in common" })]);
  });

  it("renders a review queue labelled with each run's model", () => {
    const html = attentionHtml(data([attempt(1, "a"), attempt(2, "a", { pattern: { value: "stripe", confidence: "high" } })]), 1, 2);
    expect(html).toContain("opus-5-5");
    expect(html).toContain("sonnet-5-5 right");
    expect(html).toContain("Needs a decision");
    expect(html).toContain('src="https://img.example/a.jpg"');
  });
});

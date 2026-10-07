import { describe, expect, it } from "vitest";
import { applyGate } from "../gate";
import { coloursAgree, validateOutput, type ValidationContext } from "../validate";
import { modelOutput } from "./fixtures";

const shirt: ValidationContext = { category: "shirts", productType: "clothing", sourceColours: ["navy"] };
const shoe: ValidationContext = { category: "shoes", productType: "shoes", sourceColours: ["black"] };

function validated(override: Parameters<typeof modelOutput>[0] = {}, ctx = shirt) {
  const result = validateOutput(modelOutput(override), ctx);
  if (!result.ok) throw new Error(`schema errors: ${result.schemaErrors.join(", ")}`);
  return result;
}
const codes = (findings: { code: string }[]) => findings.map((f) => f.code);

describe("validateOutput", () => {
  it("reports schema errors with paths", () => {
    const result = validateOutput({ ...modelOutput(), fit: { value: "baggy", confidence: "high" } }, shirt);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.schemaErrors.join()).toContain("fit.value");
  });

  it("drops low-confidence multi-value labels instead of failing", () => {
    const r = validated({
      aesthetics: [
        { value: "minimal", confidence: "high" },
        { value: "edgy", confidence: "low" },
      ],
      occasions: [
        { value: "work", confidence: "medium" },
        { value: "event", confidence: "low" },
      ],
      materials: [{ value: "silk", evidence: "inferred", confidence: "low" }],
    });
    expect(r.attributes.aesthetics).toEqual(["minimal"]);
    expect(r.attributes.occasions).toEqual(["work"]);
    expect(r.attributes.materials).toEqual([]);
    expect(r.dropped).toEqual(expect.arrayContaining(["aesthetics:edgy(low)", "occasions:event(low)", "materials:silk(low)"]));
    expect(r.confidences.aesthetics).toEqual({ minimal: "high" });
  });

  it("keeps at most 3 aesthetics, most confident first, with a warning", () => {
    const r = validated({
      aesthetics: [
        { value: "classic", confidence: "medium" },
        { value: "minimal", confidence: "high" },
        { value: "preppy", confidence: "medium" },
        { value: "scandinavian", confidence: "medium" },
      ],
    });
    expect(r.attributes.aesthetics).toEqual(["minimal", "classic", "preppy"]);
    expect(codes(r.warnings)).toContain("aesthetics_over_limit");
  });

  it("dedupes and removes the primary colour from secondary colours", () => {
    const r = validated({ colour_secondary: ["navy", "white", "white"] });
    expect(r.attributes.colour_secondary).toEqual(["white"]);
  });

  it("preserves stated vs inferred material evidence", () => {
    const r = validated({
      materials: [
        { value: "cotton", evidence: "stated", confidence: "high" },
        { value: "linen", evidence: "inferred", confidence: "medium" },
      ],
    });
    expect(r.attributes.materials).toEqual([
      { value: "cotton", evidence: "stated" },
      { value: "linen", evidence: "inferred" },
    ]);
  });

  it("truncates long summaries", () => {
    const r = validated({ summary: "word ".repeat(80) });
    expect(r.attributes.summary.length).toBeLessThanOrEqual(201);
    expect(codes(r.warnings)).toContain("summary_truncated");
  });

  it("only keeps suggested_category when disagreeing", () => {
    expect(validated({ category_check: { verdict: "agrees", suggested_category: "polos", confidence: "high" } }).attributes.category_check)
      .toEqual({ verdict: "agrees", suggested_category: null });
  });

  it("flags garment types inconsistent with the normalized category", () => {
    const r = validated({ garment_type: { value: "hoodie", confidence: "high" } });
    expect(codes(r.errors)).toEqual(["category_mismatch"]);
  });

  it("requires fit not_applicable for shoes", () => {
    const r = validated({ garment_type: { value: "loafers", confidence: "high" }, fit: { value: "slim", confidence: "medium" } }, shoe);
    expect(codes(r.errors)).toEqual(["shoe_fit"]);
    const good = validated(
      { garment_type: { value: "loafers", confidence: "high" }, fit: { value: "not_applicable", confidence: "high" }, colour_primary: { value: "black", confidence: "high" } },
      shoe,
    );
    expect(good.errors).toEqual([]);
  });

  it("requires a real fit for garments", () => {
    expect(codes(validated({ fit: { value: "not_applicable", confidence: "high" } }).errors)).toEqual(["garment_fit_not_applicable"]);
  });

  it("raises soft warnings without hard errors", () => {
    const r = validated({
      formality: { value: 5, confidence: "high" },
      aesthetics: [{ value: "streetwear", confidence: "high" }],
      colour_primary: { value: "beige", confidence: "high" },
    });
    expect(r.errors).toEqual([]);
    expect(codes(r.warnings)).toEqual(expect.arrayContaining(["formal_streetwear", "colour_disagrees_with_source"]));
  });

  it("warns about shorts tagged winter-only", () => {
    const r = validated(
      { garment_type: { value: "shorts", confidence: "high" }, seasons: { values: ["winter"], confidence: "high" } },
      { category: "shorts", productType: "clothing", sourceColours: [] },
    );
    expect(codes(r.warnings)).toContain("summer_item_winter_only");
  });
});

describe("coloursAgree", () => {
  it("accepts identical, near and unknown source colours", () => {
    expect(coloursAgree("navy", ["navy"])).toBe(true);
    expect(coloursAgree("black", ["navy"])).toBe(true);
    expect(coloursAgree("beige", [])).toBe(true);
    expect(coloursAgree("red", ["multi"])).toBe(true);
  });
  it("rejects distant colours", () => {
    expect(coloursAgree("beige", ["black"])).toBe(false);
  });
});

describe("applyGate", () => {
  it("completes a confident, consistent enrichment", () => {
    expect(applyGate(validated())).toEqual({ outcome: "completed", reasons: [] });
  });

  it.each([
    ["low-confidence required field", { fit: { value: "relaxed" as const, confidence: "low" as const } }, "low_confidence:fit"],
    ["low-confidence seasons", { seasons: { values: ["summer" as const], confidence: "low" as const } }, "low_confidence:seasons"],
    ["no aesthetic left after dropping", { aesthetics: [{ value: "edgy" as const, confidence: "low" as const }] }, "missing_required:aesthetics"],
    ["no occasion", { occasions: [] }, "missing_required:occasions"],
    ["no season", { seasons: { values: [], confidence: "high" as const } }, "missing_required:seasons"],
    [
      "confident category disagreement",
      { category_check: { verdict: "disagrees" as const, suggested_category: "polos" as const, confidence: "medium" as const } },
      "category_disagrees",
    ],
    ["blocking issue", { issues: ["image_multiple_items" as const] }, "issue:image_multiple_items"],
    ["category mismatch rule", { garment_type: { value: "hoodie" as const, confidence: "high" as const } }, "rule:category_mismatch"],
  ])("sends %s to review", (_label, override, reason) => {
    const gate = applyGate(validated(override));
    expect(gate.outcome).toBe("needs_review");
    expect(gate.reasons).toContain(reason);
  });

  it("ignores low-confidence category disagreement and low_information", () => {
    const gate = applyGate(
      validated({
        category_check: { verdict: "disagrees", suggested_category: "polos", confidence: "low" },
        issues: ["low_information"],
      }),
    );
    expect(gate).toEqual({ outcome: "completed", reasons: [] });
  });

  it("never blocks on optional fields", () => {
    expect(applyGate(validated({ materials: [], colour_secondary: [] })).outcome).toBe("completed");
  });
});

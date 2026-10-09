import { describe, expect, it } from "vitest";
import { applyGate, applyGateAs } from "../gate";
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

describe("taxonomy 1.1 rules", () => {
  const jeans = { category: "jeans", productType: "clothing", sourceColours: ["blue"] };
  const legs = (leg: "bootcut" | "not_applicable", confidence: "low" | "medium" = "medium") => ({
    garment_type: { value: "jeans" as const, confidence: "high" as const },
    colour_primary: { value: "blue" as const, confidence: "high" as const },
    colour_profile: { value: "muted" as const, confidence: "medium" as const },
    leg_shape: { value: leg, confidence },
  });

  it("stores a leg shape with its confidence for legwear", () => {
    const r = validated(legs("bootcut"), jeans);
    expect(r.attributes.leg_shape).toBe("bootcut");
    expect(r.confidences.leg_shape).toBe("medium");
    expect(r.warnings).toEqual([]);
  });

  it("resets a leg shape on non-legwear and records it, without blocking", () => {
    const r = validated({ leg_shape: { value: "wide", confidence: "high" } });
    expect(r.attributes.leg_shape).toBe("not_applicable");
    expect(r.dropped).toContain("leg_shape:wide(not legwear)");
    expect(r.errors).toEqual([]);
  });

  it("warns, but does not block, when legwear has no leg shape", () => {
    const r = validated(legs("not_applicable"), jeans);
    expect(codes(r.warnings)).toEqual(["leg_shape_missing"]);
    expect(applyGate(r).outcome).toBe("completed");
  });

  it("never gates on leg shape confidence", () => {
    expect(applyGate(validated(legs("bootcut", "low"), jeans))).toMatchObject({ outcome: "completed", reasons: [] });
  });

  it.each([
    ["grey", "muted"],
    ["grey", "earth"],
    ["navy", "muted"],
    ["pink", "neutral_light"],
  ] as const)("warns on %s with a %s colour profile", (colour, profile) => {
    const r = validated({ colour_primary: { value: colour, confidence: "high" }, colour_profile: { value: profile, confidence: "medium" } }, {
      ...shirt,
      sourceColours: [colour],
    });
    expect(codes(r.warnings)).toContain("colour_profile_inconsistent");
    expect(r.errors).toEqual([]);
  });

  it.each([
    ["grey", "neutral_light"],
    ["brown", "earth"],
    ["blue", "neutral_dark"],
    ["pink", "pastel"],
  ] as const)("accepts %s with a %s colour profile", (colour, profile) => {
    const r = validated({ colour_primary: { value: colour, confidence: "high" }, colour_profile: { value: profile, confidence: "medium" } }, {
      ...shirt,
      sourceColours: [colour],
    });
    expect(codes(r.warnings)).not.toContain("colour_profile_inconsistent");
  });
});

describe("denim colour (taxonomy 1.2)", () => {
  const denim = (overrides: Parameters<typeof modelOutput>[0]) =>
    validated({ materials: [{ value: "denim", evidence: "stated", confidence: "high" }], ...overrides });

  it.each([
    // Runs 4–6: "Gant Reg denim shirt", dark washed cotton denim, source colour "Mörkblå".
    ["a dark denim shirt called navy", { garment_type: { value: "casual_shirt" as const, confidence: "high" as const } }],
    ["dark jeans called navy", { garment_type: { value: "jeans" as const, confidence: "high" as const }, materials: [] }],
  ])("warns on %s, without blocking", (_label, override) => {
    const r = denim({ ...override, colour_primary: { value: "navy", confidence: "medium" } }, );
    expect(codes(r.warnings)).toContain("denim_navy");
    expect(applyGate(r).reasons).not.toContain("rule:denim_navy");
  });

  it("accepts dark denim as blue with a neutral_dark profile", () => {
    const r = denim({ garment_type: { value: "casual_shirt", confidence: "high" }, colour_primary: { value: "blue", confidence: "high" }, colour_profile: { value: "neutral_dark", confidence: "medium" } });
    expect(codes(r.warnings)).toEqual([]);
  });

  it("leaves a navy wool or cotton garment alone", () => {
    const r = validated({ materials: [{ value: "wool", evidence: "stated", confidence: "high" }] });
    expect(codes(r.warnings)).not.toContain("denim_navy");
    expect(codes(validated().warnings)).not.toContain("denim_navy"); // navy cotton oxford
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
    expect(applyGate(validated())).toEqual({ outcome: "completed", reasons: [], notes: [] });
  });

  it("completes with low-confidence fit alone, keeping the confidence and a note", () => {
    const input = validated({ fit: { value: "relaxed", confidence: "low" } });
    expect(applyGate(input)).toEqual({ outcome: "completed", reasons: [], notes: ["low_confidence:fit"] });
    expect(input.confidences.fit).toBe("low");
    expect(input.attributes.fit).toBe("relaxed");
  });

  it.each([
    ["garment_type", { garment_type: { value: "oxford_shirt" as const, confidence: "low" as const } }],
    ["colour_primary", { colour_primary: { value: "navy" as const, confidence: "low" as const } }],
    ["pattern", { pattern: { value: "solid" as const, confidence: "low" as const } }],
    ["formality", { formality: { value: 3 as const, confidence: "low" as const } }],
  ])("still blocks on low-confidence %s", (field, override) => {
    expect(applyGate(validated(override)).reasons).toEqual([`low_confidence:${field}`]);
  });

  it.each([
    ["a low-confidence colour", { colour_primary: { value: "navy" as const, confidence: "low" as const } }, "low_confidence:colour_primary"],
    ["a blocking issue", { issues: ["image_unclear" as const] }, "issue:image_unclear"],
    [
      "a category disagreement",
      { category_check: { verdict: "disagrees" as const, suggested_category: "polos" as const, confidence: "high" as const } },
      "category_disagrees",
    ],
    ["a rule violation", { garment_type: { value: "hoodie" as const, confidence: "high" as const } }, "rule:category_mismatch"],
    ["a missing aesthetic", { aesthetics: [] }, "missing_required:aesthetics"],
  ])("low-confidence fit with %s still goes to review", (_label, override, reason) => {
    const gate = applyGate(validated({ fit: { value: "relaxed", confidence: "low" }, ...override }));
    expect(gate.outcome).toBe("needs_review");
    expect(gate.reasons).toContain(reason);
    expect(gate.reasons).not.toContain("low_confidence:fit");
    expect(gate.notes).toEqual(["low_confidence:fit"]);
  });

  it.each([
    ["low-confidence required field", { pattern: { value: "solid" as const, confidence: "low" as const } }, "low_confidence:pattern"],
    ["low-confidence seasons", { seasons: { values: ["summer" as const], confidence: "low" as const } }, "low_confidence:seasons"],
    ["no aesthetic returned", { aesthetics: [] }, "missing_required:aesthetics"],
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
    expect(gate).toEqual({ outcome: "completed", reasons: [], notes: [] });
  });

  it("replays gate 1.0.0, where low-confidence fit still blocked", () => {
    const input = validated({ fit: { value: "relaxed", confidence: "low" } });
    expect(applyGateAs("1.0.0", input)).toEqual({ outcome: "needs_review", reasons: ["low_confidence:fit"], notes: [] });
    expect(applyGateAs("1.2.0", input)).toEqual(applyGate(input));
    expect(applyGateAs("1.1.0", input)).toEqual(applyGate(input));
    expect(applyGateAs("1.0.0", validated())).toMatchObject({ outcome: "completed" });
  });

  describe("low-confidence aesthetics (gate 1.2.0)", () => {
    const weak = { aesthetics: [{ value: "streetwear" as const, confidence: "low" as const }, { value: "edgy" as const, confidence: "low" as const }] };

    it("keeps the best label with its low confidence instead of dropping it", () => {
      const r = validated(weak);
      expect(r.attributes.aesthetics).toEqual(["streetwear"]);
      expect(r.confidences.aesthetics).toEqual({ streetwear: "low" });
      expect(r.dropped).toEqual(["aesthetics:edgy(low)"]);
    });

    it("completes on low confidence alone, with a note", () => {
      expect(applyGate(validated(weak))).toEqual({ outcome: "completed", reasons: [], notes: ["low_confidence:aesthetics"] });
    });

    it("still drops low labels when a confident one exists", () => {
      const r = validated({ aesthetics: [{ value: "edgy", confidence: "low" }, { value: "minimal", confidence: "medium" }] });
      expect(r.attributes.aesthetics).toEqual(["minimal"]);
      expect(r.dropped).toEqual(["aesthetics:edgy(low)"]);
      expect(applyGate(r).notes).toEqual([]);
    });

    it.each([
      ["no aesthetics at all", { aesthetics: [] }, "missing_required:aesthetics"],
      ["no occasion", { ...weak, occasions: [] }, "missing_required:occasions"],
      ["a low-confidence pattern", { ...weak, pattern: { value: "solid" as const, confidence: "low" as const } }, "low_confidence:pattern"],
      ["a blocking issue", { ...weak, issues: ["image_unclear" as const] }, "issue:image_unclear"],
      ["a rule violation", { ...weak, garment_type: { value: "hoodie" as const, confidence: "high" as const } }, "rule:category_mismatch"],
    ])("still goes to review with %s", (_label, override, reason) => {
      const gate = applyGate(validated(override));
      expect(gate.outcome).toBe("needs_review");
      expect(gate.reasons).toContain(reason);
      expect(gate.reasons).not.toContain("low_confidence:aesthetics");
    });

    it("low fit and low aesthetics together are both advisory", () => {
      expect(applyGate(validated({ ...weak, fit: { value: "regular", confidence: "low" } }))).toEqual({
        outcome: "completed",
        reasons: [],
        notes: ["low_confidence:fit", "low_confidence:aesthetics"],
      });
    });

    it("replays earlier gates as they behaved", () => {
      const input = validated({ ...weak, fit: { value: "regular", confidence: "low" } });
      expect(applyGateAs("1.1.0", input)).toEqual({ outcome: "needs_review", reasons: ["missing_required:aesthetics"], notes: ["low_confidence:fit"] });
      expect(applyGateAs("1.0.0", input)).toEqual({
        outcome: "needs_review",
        reasons: ["low_confidence:fit", "missing_required:aesthetics"],
        notes: [],
      });
    });
  });

  it("never blocks on optional fields", () => {
    expect(applyGate(validated({ materials: [], colour_secondary: [] })).outcome).toBe("completed");
  });
});

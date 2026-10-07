import { describe, expect, it } from "vitest";
import { CATEGORIES, productTypeFor } from "@/server/catalog/types";
import {
  GARMENT_TYPES,
  GARMENT_TYPES_BY_CATEGORY,
  ModelOutputSchema,
  outputJsonSchema,
  TAXONOMY_VERSION,
} from "../taxonomy";
import { modelOutput } from "./fixtures";

describe("taxonomy", () => {
  it("is versioned with semver", () => {
    expect(TAXONOMY_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("accepts a valid output", () => {
    expect(ModelOutputSchema.safeParse(modelOutput()).success).toBe(true);
  });

  it.each([
    ["unknown garment type", { garment_type: { value: "kimono", confidence: "high" } }],
    ["unknown colour", { colour_primary: { value: "teal", confidence: "high" } }],
    ["float confidence", { fit: { value: "slim", confidence: 0.9 } }],
    ["formality out of range", { formality: { value: 6, confidence: "high" } }],
    ["string formality", { formality: { value: "casual", confidence: "high" } }],
    ["all_season value", { seasons: { values: ["all_season"], confidence: "high" } }],
    ["Style name as aesthetic", { aesthetics: [{ value: "work", confidence: "high" }] }],
  ])("rejects %s", (_label, override) => {
    expect(ModelOutputSchema.safeParse({ ...modelOutput(), ...override }).success).toBe(false);
  });

  it("rejects extra fields", () => {
    expect(ModelOutputSchema.safeParse({ ...modelOutput(), mood: "sunny" }).success).toBe(false);
  });

  it("gives every clothing category and shoes a garment-type mapping", () => {
    const needed = CATEGORIES.filter((c) => ["clothing", "shoes"].includes(productTypeFor(c)));
    for (const category of needed) expect(GARMENT_TYPES_BY_CATEGORY[category]?.length, category).toBeGreaterThan(0);
  });

  it("only maps to known garment types, and every type except 'other' is reachable", () => {
    const mapped = new Set(Object.values(GARMENT_TYPES_BY_CATEGORY).flat());
    for (const t of mapped) expect(GARMENT_TYPES).toContain(t);
    expect(GARMENT_TYPES.filter((t) => t !== "other" && !mapped.has(t))).toEqual([]);
  });

  it("emits a strict-mode-compatible JSON schema (all objects closed, all properties required)", () => {
    const visit = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      if (n.type === "object") {
        expect(n.additionalProperties).toBe(false);
        expect([...(n.required as string[])].sort()).toEqual(Object.keys(n.properties as object).sort());
      }
      for (const forbidden of ["minItems", "maxItems", "minLength", "maxLength", "minimum", "maximum"]) {
        expect(n[forbidden]).toBeUndefined();
      }
      Object.values(n).forEach((child) => (Array.isArray(child) ? child.forEach(visit) : visit(child)));
    };
    visit(outputJsonSchema());
  });

  it("JSON schema and Zod schema describe the same top-level fields", () => {
    const jsonFields = Object.keys((outputJsonSchema().properties as object) ?? {}).sort();
    expect(jsonFields).toEqual(Object.keys(ModelOutputSchema.shape).sort());
  });
});

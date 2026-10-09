import { describe, expect, it } from "vitest";
import { CANONICAL_COLORS, CATEGORIES, productTypeFor } from "@/server/catalog/types";
import { PROMPT_VERSION, SYSTEM_PROMPT } from "../prompt";
import {
  AESTHETIC_DEFINITIONS,
  AESTHETICS,
  COLOUR_PRIMARY_GUIDE,
  COLOUR_PROFILE_DEFINITIONS,
  COLOUR_PROFILES,
  COLOUR_PROFILES_BY_COLOUR,
  GARMENT_TYPES,
  GARMENT_TYPES_BY_CATEGORY,
  LEG_SHAPE_DEFINITIONS,
  LEG_SHAPE_GARMENT_TYPES,
  LEG_SHAPES,
  ModelOutputSchema,
  outputJsonSchema,
  PATTERN_DEFINITIONS,
  PATTERNS,
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
    ["unknown leg shape", { leg_shape: { value: "balloon", confidence: "high" } }],
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

  it("requires leg_shape since 1.1.0 (1.0.0-shaped output is a schema failure, not silently accepted)", () => {
    const v100: Partial<ReturnType<typeof modelOutput>> = modelOutput();
    delete v100.leg_shape;
    expect(ModelOutputSchema.safeParse(v100).success).toBe(false);
  });

  it("defines every aesthetic, pattern, colour profile and leg shape", () => {
    expect(Object.keys(AESTHETIC_DEFINITIONS).sort()).toEqual([...AESTHETICS].sort());
    expect(Object.keys(PATTERN_DEFINITIONS).sort()).toEqual([...PATTERNS].sort());
    expect(Object.keys(COLOUR_PROFILE_DEFINITIONS).sort()).toEqual([...COLOUR_PROFILES].sort());
    expect(Object.keys(LEG_SHAPE_DEFINITIONS).sort()).toEqual(LEG_SHAPES.filter((l) => l !== "not_applicable").sort());
  });

  it("allows at least one colour profile for every canonical colour, and keeps neutrals neutral", () => {
    for (const colour of CANONICAL_COLORS) expect(COLOUR_PROFILES_BY_COLOUR[colour].length, colour).toBeGreaterThan(0);
    for (const neutral of ["black", "navy", "grey", "white", "off-white"] as const) {
      expect(COLOUR_PROFILES_BY_COLOUR[neutral].every((p) => p.startsWith("neutral_")), neutral).toBe(true);
    }
    for (const chromatic of ["green", "red", "burgundy", "pink", "purple", "yellow"] as const) {
      expect(COLOUR_PROFILES_BY_COLOUR[chromatic].some((p) => p.startsWith("neutral_")), chromatic).toBe(false);
    }
  });

  it("only gives legwear a leg shape", () => {
    for (const t of LEG_SHAPE_GARMENT_TYPES) expect(GARMENT_TYPES).toContain(t);
    const legwear = new Set([...GARMENT_TYPES_BY_CATEGORY.trousers!, ...GARMENT_TYPES_BY_CATEGORY.jeans!]);
    expect(LEG_SHAPE_GARMENT_TYPES.filter((t) => t !== "jumpsuit").sort()).toEqual([...legwear].sort());
  });
});

describe("prompt 1.2", () => {
  it("is versioned with the taxonomy", () => {
    expect(PROMPT_VERSION).toBe("1.2.0");
    expect(TAXONOMY_VERSION).toBe("1.2.0");
  });

  it("separates hue from profile and keeps denim blue", () => {
    for (const rule of COLOUR_PRIMARY_GUIDE) expect(SYSTEM_PROMPT).toContain(`  - ${rule}`);
    expect(SYSTEM_PROMPT).toMatch(/Indigo denim .* is blue, never navy/);
    expect(SYSTEM_PROMPT).toMatch(/darkness alone never changes the hue/);
    // A dark wash keeps its darkness in the profile, which the colour families allow.
    expect(COLOUR_PROFILES_BY_COLOUR.blue).toContain("neutral_dark");
  });

  it("carries the taxonomy's definitions verbatim", () => {
    for (const d of [AESTHETIC_DEFINITIONS, PATTERN_DEFINITIONS, COLOUR_PROFILE_DEFINITIONS, LEG_SHAPE_DEFINITIONS]) {
      for (const [value, meaning] of Object.entries(d)) expect(SYSTEM_PROMPT).toContain(`- ${value}: ${meaning}`);
    }
  });

  it("states the review-driven decision rules", () => {
    expect(SYSTEM_PROMPT).toMatch(/glen check \/ Prince of Wales/);
    expect(SYSTEM_PROMPT).toMatch(/- solid: [^\n]*micro-check/);
    expect(SYSTEM_PROMPT).toMatch(/Not for an item that is merely simple, conventional or well made/);
    expect(SYSTEM_PROMPT).toMatch(/faux shearling, teddy and sherpa pile are synthetic/);
    expect(SYSTEM_PROMPT).toMatch(/Materials never change garment_type/);
  });
});

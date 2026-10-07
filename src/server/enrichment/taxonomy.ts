/**
 * The StyleAI semantic taxonomy — the one place its allowed values live.
 *
 * Everything else derives from this module: the JSON schema sent to models
 * (`outputJsonSchema`), the Zod schema their output is validated against
 * (`ModelOutputSchema`), the category ↔ garment-type consistency rules and the
 * prompt's value glossary. Changing any value list means bumping
 * TAXONOMY_VERSION, which marks every product's enrichment as stale.
 *
 * These are product characteristics. They are deliberately not user Styles:
 * nothing here (or anywhere in enrichment) maps an aesthetic or occasion to
 * Everyday / Work / Vacation — that relationship is learned per Style later.
 */

import { z } from "zod";
import { CANONICAL_COLORS, CATEGORIES, type Category } from "@/server/catalog/types";

export const TAXONOMY_VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// Value lists
// ---------------------------------------------------------------------------

export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

/** Internal numeric mapping; the persisted representation stays the three levels. */
export const CONFIDENCE_SCORE: Record<Confidence, number> = { low: 0.3, medium: 0.6, high: 0.9 };

/**
 * Garment types, grouped by what they are. Lengths (mini/midi/maxi) are part of
 * the type for skirts and dresses because that is how they are shopped; for
 * everything else, cut is captured by `fit` and fabric by `materials`.
 */
export const GARMENT_TYPES = [
  // tops
  "tshirt",
  "long_sleeve_tshirt",
  "tank",
  "top",
  "blouse",
  "oxford_shirt",
  "dress_shirt",
  "casual_shirt",
  "overshirt",
  "polo",
  "rugby_shirt",
  // knitwear & sweats
  "crewneck_knit",
  "vneck_knit",
  "rollneck_knit",
  "cardigan",
  "half_zip",
  "knit_vest",
  "sweatshirt",
  "hoodie",
  // tailoring
  "blazer",
  "suit",
  "waistcoat",
  // outerwear
  "coat",
  "trench",
  "parka",
  "puffer",
  "quilted_jacket",
  "bomber",
  "field_jacket",
  "denim_jacket",
  "leather_jacket",
  "shell_jacket",
  "casual_jacket",
  "gilet",
  // bottoms
  "chinos",
  "tailored_trousers",
  "casual_trousers",
  "wide_trousers",
  "cargo_trousers",
  "joggers",
  "leggings",
  "jeans",
  "shorts",
  "mini_skirt",
  "midi_skirt",
  "maxi_skirt",
  // one-pieces
  "mini_dress",
  "midi_dress",
  "maxi_dress",
  "jumpsuit",
  // shoes
  "sneakers",
  "loafers",
  "derbies",
  "boots",
  "sandals",
  "heels",
  "ballet_flats",
  "mules",
  // escape hatch: always goes to review
  "other",
] as const;
export type GarmentType = (typeof GARMENT_TYPES)[number];

export const FITS = ["slim", "regular", "relaxed", "oversized", "not_applicable"] as const;
export type Fit = (typeof FITS)[number];

export const COLOUR_PROFILES = ["neutral_dark", "neutral_light", "earth", "muted", "bright", "pastel"] as const;
export type ColourProfile = (typeof COLOUR_PROFILES)[number];

export const PATTERNS = ["solid", "stripe", "check", "print", "graphic", "texture"] as const;
export type Pattern = (typeof PATTERNS)[number];

export const MATERIALS = [
  "cotton",
  "linen",
  "wool",
  "cashmere",
  "silk",
  "denim",
  "corduroy",
  "leather",
  "suede",
  "viscose",
  "synthetic",
  "down",
] as const;
export type Material = (typeof MATERIALS)[number];

export const MATERIAL_EVIDENCE = ["stated", "inferred"] as const;
export type MaterialEvidence = (typeof MATERIAL_EVIDENCE)[number];

export const AESTHETICS = [
  "minimal",
  "classic",
  "preppy",
  "scandinavian",
  "streetwear",
  "sporty",
  "utility",
  "outdoor",
  "romantic",
  "bohemian",
  "edgy",
  "statement",
] as const;
export type Aesthetic = (typeof AESTHETICS)[number];

/** Ordinal: 1 lounge/sport · 2 casual · 3 smart casual · 4 business · 5 formal. */
export const FORMALITY_LEVELS = [1, 2, 3, 4, 5] as const;
export type Formality = (typeof FORMALITY_LEVELS)[number];

export const OCCASIONS = ["everyday", "work", "weekend", "evening", "vacation", "outdoor", "event"] as const;
export type Occasion = (typeof OCCASIONS)[number];

export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export type Season = (typeof SEASONS)[number];

export const CATEGORY_VERDICTS = ["agrees", "disagrees"] as const;

export const ISSUES = [
  "image_not_product",
  "image_multiple_items",
  "image_unclear",
  "not_clothing",
  "low_information",
] as const;
export type Issue = (typeof ISSUES)[number];

export const MAX_SECONDARY_COLOURS = 3;
export const MAX_AESTHETICS = 3;
export const MAX_SUMMARY_LENGTH = 200;
export const MAX_TAXONOMY_GAPS = 3;

// ---------------------------------------------------------------------------
// Category ↔ garment type consistency
// ---------------------------------------------------------------------------

/**
 * Which garment types are consistent with each normalized category. Deliberately
 * a little generous at the borders (a knitted polo can live under knitwear),
 * but knitwear vs sweatshirt stays a real distinction — a mismatch there is
 * exactly the normalization error we want surfaced for review.
 */
export const GARMENT_TYPES_BY_CATEGORY: Partial<Record<Category, readonly GarmentType[]>> = {
  "t-shirts": ["tshirt", "long_sleeve_tshirt", "tank"],
  shirts: ["oxford_shirt", "dress_shirt", "casual_shirt", "overshirt", "blouse"],
  polos: ["polo", "rugby_shirt"],
  knitwear: ["crewneck_knit", "vneck_knit", "rollneck_knit", "cardigan", "half_zip", "knit_vest", "polo", "top"],
  sweatshirts: ["sweatshirt", "hoodie", "half_zip", "rugby_shirt"],
  tops: ["top", "tank", "blouse", "tshirt", "long_sleeve_tshirt"],
  blazers: ["blazer"],
  suits: ["suit", "blazer"],
  waistcoats: ["waistcoat", "knit_vest", "gilet"],
  outerwear: [
    "coat",
    "trench",
    "parka",
    "puffer",
    "quilted_jacket",
    "bomber",
    "field_jacket",
    "denim_jacket",
    "leather_jacket",
    "shell_jacket",
    "casual_jacket",
    "gilet",
    "overshirt",
  ],
  trousers: [
    "chinos",
    "tailored_trousers",
    "casual_trousers",
    "wide_trousers",
    "cargo_trousers",
    "joggers",
    "leggings",
  ],
  jeans: ["jeans"],
  shorts: ["shorts"],
  skirts: ["mini_skirt", "midi_skirt", "maxi_skirt"],
  dresses: ["mini_dress", "midi_dress", "maxi_dress", "jumpsuit"],
  shoes: ["sneakers", "loafers", "derbies", "boots", "sandals", "heels", "ballet_flats", "mules"],
};

export function garmentTypeFitsCategory(garmentType: GarmentType, category: Category): boolean {
  const allowed = GARMENT_TYPES_BY_CATEGORY[category];
  return !!allowed && allowed.includes(garmentType);
}

// ---------------------------------------------------------------------------
// Model output — Zod (validation) and JSON schema (sent to the provider)
// ---------------------------------------------------------------------------

const confidence = z.enum(CONFIDENCE_LEVELS);
const scored = <T extends z.ZodType>(value: T) => z.object({ value, confidence }).strict();

/**
 * The shape a model must return. Type and enum membership are strict (a
 * violation is a schema failure); cardinality limits (max 3 aesthetics, summary
 * length, ...) are normalized afterwards with a warning, because truncating is
 * more useful than failing a product over one extra label.
 */
export const ModelOutputSchema = z
  .object({
    garment_type: scored(z.enum(GARMENT_TYPES)),
    fit: scored(z.enum(FITS)),
    colour_primary: scored(z.enum(CANONICAL_COLORS)),
    colour_secondary: z.array(z.enum(CANONICAL_COLORS)),
    colour_profile: scored(z.enum(COLOUR_PROFILES)),
    pattern: scored(z.enum(PATTERNS)),
    materials: z.array(
      z.object({ value: z.enum(MATERIALS), evidence: z.enum(MATERIAL_EVIDENCE), confidence }).strict(),
    ),
    aesthetics: z.array(scored(z.enum(AESTHETICS))),
    formality: scored(z.literal(FORMALITY_LEVELS)),
    occasions: z.array(scored(z.enum(OCCASIONS))),
    seasons: z.object({ values: z.array(z.enum(SEASONS)), confidence }).strict(),
    category_check: z
      .object({
        verdict: z.enum(CATEGORY_VERDICTS),
        suggested_category: z.enum(CATEGORIES).nullable(),
        confidence,
      })
      .strict(),
    issues: z.array(z.enum(ISSUES)),
    summary: z.string(),
    taxonomy_gaps: z.array(z.string()),
  })
  .strict();

export type ModelOutput = z.infer<typeof ModelOutputSchema>;

type JsonSchema = Record<string, unknown>;

const enumOf = (values: readonly (string | number)[]): JsonSchema => ({
  type: typeof values[0] === "number" ? "integer" : "string",
  enum: [...values],
});
const object = (properties: Record<string, JsonSchema>, description?: string): JsonSchema => ({
  type: "object",
  ...(description ? { description } : {}),
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const array = (items: JsonSchema, description?: string): JsonSchema => ({
  type: "array",
  ...(description ? { description } : {}),
  items,
});
const confidenceSchema = enumOf(CONFIDENCE_LEVELS);
const scoredSchema = (value: JsonSchema) => object({ value, confidence: confidenceSchema });

/**
 * The JSON schema handed to providers' structured-output modes. It mirrors
 * ModelOutputSchema but uses only the portable subset (types, enums, required,
 * additionalProperties: false; no length/number constraints), which both
 * Anthropic and OpenAI strict modes accept.
 */
export function outputJsonSchema(): JsonSchema {
  return object({
    garment_type: scoredSchema(enumOf(GARMENT_TYPES)),
    fit: scoredSchema(enumOf(FITS)),
    colour_primary: scoredSchema(enumOf(CANONICAL_COLORS)),
    colour_secondary: array(enumOf(CANONICAL_COLORS), `0-${MAX_SECONDARY_COLOURS} visually meaningful secondary colours`),
    colour_profile: scoredSchema(enumOf(COLOUR_PROFILES)),
    pattern: scoredSchema(enumOf(PATTERNS)),
    materials: array(
      object({ value: enumOf(MATERIALS), evidence: enumOf(MATERIAL_EVIDENCE), confidence: confidenceSchema }),
    ),
    aesthetics: array(scoredSchema(enumOf(AESTHETICS)), `1-${MAX_AESTHETICS} labels`),
    formality: scoredSchema(enumOf(FORMALITY_LEVELS)),
    occasions: array(scoredSchema(enumOf(OCCASIONS))),
    seasons: object({ values: array(enumOf(SEASONS)), confidence: confidenceSchema }),
    category_check: object({
      verdict: enumOf(CATEGORY_VERDICTS),
      suggested_category: { anyOf: [enumOf(CATEGORIES), { type: "null" }] },
      confidence: confidenceSchema,
    }),
    issues: array(enumOf(ISSUES)),
    summary: { type: "string", description: `English, at most ${MAX_SUMMARY_LENGTH} characters` },
    taxonomy_gaps: array({ type: "string" }, `0-${MAX_TAXONOMY_GAPS} concepts the taxonomy could not express`),
  });
}

export const OUTPUT_SCHEMA_NAME = "styleai_product_enrichment";

// ---------------------------------------------------------------------------
// Normalized, persisted attributes
// ---------------------------------------------------------------------------

/** What is stored in product_enrichments.attributes (low-confidence labels dropped). */
export interface EnrichmentAttributes {
  garment_type: GarmentType;
  fit: Fit;
  colour_primary: (typeof CANONICAL_COLORS)[number];
  colour_secondary: (typeof CANONICAL_COLORS)[number][];
  colour_profile: ColourProfile;
  pattern: Pattern;
  materials: { value: Material; evidence: MaterialEvidence }[];
  aesthetics: Aesthetic[];
  formality: Formality;
  occasions: Occasion[];
  seasons: Season[];
  category_check: { verdict: (typeof CATEGORY_VERDICTS)[number]; suggested_category: Category | null };
  issues: Issue[];
  summary: string;
  taxonomy_gaps: string[];
}

/** What is stored in product_enrichments.confidences. */
export interface EnrichmentConfidences {
  garment_type: Confidence;
  fit: Confidence;
  colour_primary: Confidence;
  colour_profile: Confidence;
  pattern: Confidence;
  formality: Confidence;
  seasons: Confidence;
  category_check: Confidence;
  materials: Partial<Record<Material, Confidence>>;
  aesthetics: Partial<Record<Aesthetic, Confidence>>;
  occasions: Partial<Record<Occasion, Confidence>>;
}

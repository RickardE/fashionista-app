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
import { CANONICAL_COLORS, CATEGORIES, type CanonicalColor, type Category } from "@/server/catalog/types";

/**
 * Results are stored with the version that produced them; a consumer reading
 * an older result must interpret it by that version's definitions.
 *   1.0.0  initial taxonomy
 *   1.1.0  adds `leg_shape` and the `shearling` material; defines every
 *          aesthetic (tightening `classic`), pattern decision rules (glen /
 *          Prince of Wales checks, micro-patterns) and colour profiles by
 *          colour family. No value was removed or renamed.
 *   1.2.0  primary-colour rules (COLOUR_PRIMARY_GUIDE): hue and profile are
 *          separate decisions; indigo denim is blue at any wash depth, navy
 *          is a dyed dark blue. Values unchanged.
 */
export const TAXONOMY_VERSION = "1.2.0";

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

/**
 * Silhouette of the leg from hip to hem, for trousers, jeans and jumpsuits.
 * Separate from `fit` (how close the garment sits): slim-fit jeans can be
 * straight or tapered; a relaxed fit can be wide or tapered.
 */
export const LEG_SHAPES = ["skinny", "straight", "tapered", "bootcut", "flare", "wide", "not_applicable"] as const;
export type LegShape = (typeof LEG_SHAPES)[number];

export const LEG_SHAPE_DEFINITIONS: Record<Exclude<LegShape, "not_applicable">, string> = {
  skinny: "close to the leg all the way down",
  straight: "same width from knee to hem",
  tapered: "narrows from knee to hem",
  bootcut: "slim through the thigh, opens slightly below the knee (fits over a boot)",
  flare: "fitted to the knee, then widens clearly to the hem",
  wide: "wide from hip or thigh all the way down (incl. palazzo, culottes, barrel)",
};

/** Garment types that have a leg shape; every other type takes not_applicable. */
export const LEG_SHAPE_GARMENT_TYPES = [
  "chinos",
  "tailored_trousers",
  "casual_trousers",
  "wide_trousers",
  "cargo_trousers",
  "joggers",
  "leggings",
  "jeans",
  "jumpsuit",
] as const;

/**
 * How to choose colour_primary (the hue), as opposed to colour_profile (how
 * light, dark, faded or saturated that hue is). Since 1.2.0.
 */
export const COLOUR_PRIMARY_GUIDE = [
  "colour_primary names the hue; colour_profile says how dark, light, faded or saturated it is. Decide the hue first, then the profile — darkness alone never changes the hue.",
  "Indigo denim (raw, rinse, dark, mid, light or bleached wash) is blue, never navy: a dark wash is blue with a neutral_dark profile, a faded mid wash is blue with muted, a very light wash is blue with pastel. Black, grey or white denim takes that colour.",
  "navy is a uniformly dyed, very dark blue that reads almost black (wool, cotton twill, jersey, knit) — not a denim wash.",
  "Judge the hue from the image. The catalogue colour is supporting evidence, not the answer: merchants often call dark denim \"dark blue\" or \"navy\".",
] as const;

export const COLOUR_PROFILES = ["neutral_dark", "neutral_light", "earth", "muted", "bright", "pastel"] as const;
export type ColourProfile = (typeof COLOUR_PROFILES)[number];

export const COLOUR_PROFILE_DEFINITIONS: Record<ColourProfile, string> = {
  neutral_dark: "black, navy, charcoal or dark grey, and dark indigo denim",
  neutral_light: "white, off-white, cream, beige, stone, and light-to-mid grey",
  earth: "brown, tan, cognac, camel, rust, olive and khaki, even when dark",
  muted: "a chromatic colour that is greyed, dusty, washed out or deep (sage, dusty blue, faded denim, burgundy, bottle green)",
  bright: "a saturated, vivid chromatic colour (red, cobalt, kelly green, orange, yellow, hot pink)",
  pastel: "a light, soft, whitened chromatic colour (baby blue, light pink, mint, lavender, butter yellow)",
};

/**
 * The profiles each primary colour can have. The profile adds what canonical
 * colours cannot say — how light a grey is, how saturated a blue or pink is —
 * so neutrals never take a chromatic profile and chromatic colours never take
 * a neutral one (dark indigo denim aside). Outside this table: a warning.
 */
export const COLOUR_PROFILES_BY_COLOUR: Record<CanonicalColor, readonly ColourProfile[]> = {
  black: ["neutral_dark"],
  navy: ["neutral_dark"],
  grey: ["neutral_dark", "neutral_light"],
  white: ["neutral_light"],
  "off-white": ["neutral_light"],
  beige: ["neutral_light", "earth"],
  brown: ["earth"],
  olive: ["earth"],
  blue: ["neutral_dark", "muted", "bright", "pastel"],
  green: ["muted", "bright", "pastel"],
  red: ["muted", "bright"],
  burgundy: ["muted"],
  pink: ["muted", "bright", "pastel"],
  purple: ["muted", "bright", "pastel"],
  yellow: ["muted", "bright", "pastel"],
  orange: ["earth", "muted", "bright", "pastel"],
  multi: COLOUR_PROFILES,
  silver: ["neutral_light", "neutral_dark"],
  gold: ["earth", "bright"],
};

export const PATTERNS = ["solid", "stripe", "check", "print", "graphic", "texture"] as const;
export type Pattern = (typeof PATTERNS)[number];

/** Judged as seen at outfit distance, not in a close-up. */
export const PATTERN_DEFINITIONS: Record<Pattern, string> = {
  solid:
    "one colour at outfit distance. Includes a small embroidered logo, and woven micro-patterns only visible up close (micro-check, pin-dot, birdseye, sharkskin, nailhead)",
  stripe: "stripes of any width or direction, woven or printed (incl. pinstripe, chalk stripe, Breton)",
  check:
    "any crossing lines or blocks of colour: gingham, tartan/plaid, windowpane, houndstooth, glen check / Prince of Wales — even when tonal or low-contrast",
  print: "all-over printed or woven motifs that are not stripes or checks (floral, paisley, abstract, camouflage, animal)",
  graphic: "large logos, text or placed artwork",
  texture:
    "surface relief in a single colour: visible knit, cable, rib, waffle, bouclé, quilting, corduroy wale, seersucker. Not for woven colour patterns: a check is a check",
};

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
  "shearling",
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

/**
 * What each aesthetic means. An aesthetic is a recognisable style a garment
 * signals, not a quality judgement: plain, well made or versatile is not an
 * aesthetic in itself.
 */
export const AESTHETIC_DEFINITIONS: Record<Aesthetic, string> = {
  minimal: "clean lines, no visible branding or decoration, restrained colour",
  classic:
    "a long-established archetype whose design has stayed essentially unchanged for decades — trench coat, navy blazer, oxford shirt, camel overcoat, plain crewneck in a fine yarn, straight dark jeans, penny loafer, Breton top. Not for an item that is merely simple, conventional or well made, nor for trend-driven cuts and details (wide-leg or washed jeans, cropped, oversized, puff sleeves, statement details)",
  preppy: "collegiate and country-club codes: varsity/college lettering, rugby and polo shirts, cable knits, stripes, crests, button-downs",
  scandinavian: "Nordic understatement: muted palette, relaxed functional shapes, natural materials",
  streetwear: "urban youth codes: loose or oversized cuts, washed/distressed denim, prominent logos and graphics, hoodies, skate and hip-hop references",
  sporty: "athletic references: technical fabrics, track, tennis or running details, stripes on sleeves",
  utility: "workwear and military function: cargo pockets, field jackets, sturdy canvas or twill, overshirts",
  outdoor: "made for weather and terrain: shells, fleece, puffers, hiking and mountain references",
  romantic: "soft and feminine: ruffles, lace, puff or flutter sleeves, florals, delicate fabrics",
  bohemian: "free-spirited and artisanal: flowing shapes, embroidery, fringe, ethnic and folk prints",
  edgy: "dark, rebellious codes: black leather, studs, hardware, distressing, rock and punk references",
  statement: "built to be noticed: unusual shape, volume, colour, texture or embellishment",
};

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
    leg_shape: scored(z.enum(LEG_SHAPES)),
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
    leg_shape: scoredSchema(enumOf(LEG_SHAPES)),
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

/**
 * What is stored in product_enrichments.attributes (low-confidence labels
 * dropped). Fields added in a later taxonomy version are optional: results
 * stored under an earlier version do not have them.
 */
export interface EnrichmentAttributes {
  garment_type: GarmentType;
  fit: Fit;
  colour_primary: (typeof CANONICAL_COLORS)[number];
  colour_secondary: (typeof CANONICAL_COLORS)[number][];
  colour_profile: ColourProfile;
  pattern: Pattern;
  /** Since 1.1.0. */
  leg_shape?: LegShape;
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
  /** Since 1.1.0. */
  leg_shape?: Confidence;
  formality: Confidence;
  seasons: Confidence;
  category_check: Confidence;
  materials: Partial<Record<Material, Confidence>>;
  aesthetics: Partial<Record<Aesthetic, Confidence>>;
  occasions: Partial<Record<Occasion, Confidence>>;
}

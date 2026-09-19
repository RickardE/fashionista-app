import type { StylePreset } from "@/lib/types";

/** Starting points offered out of the box. Each becomes its own independent,
 * separately-learning style profile the first time the app loads. */
export const BUILTIN_STYLE_PRESETS: StylePreset[] = [
  {
    id: "everyday",
    name: "Everyday",
    description: "Relaxed · Minimal · Scandinavian",
    seedAffinity: { relaxed: 2, neutral: 2, layer: 1, knitwear: 1 },
  },
  {
    id: "work",
    name: "Work",
    description: "Tailored · Clean · Sophisticated",
    seedAffinity: { tailoring: 3, neutral: 2, black: 1 },
  },
  {
    id: "vacation",
    name: "Vacation",
    description: "Linen · Relaxed · Mediterranean",
    seedAffinity: { natural: 3, relaxed: 2, neutral: 1 },
  },
];

export const DEFAULT_STYLE_ID = BUILTIN_STYLE_PRESETS[0].id;

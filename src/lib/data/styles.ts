import type { PersonalStyle } from "@/lib/types";

export const PERSONAL_STYLES: PersonalStyle[] = [
  {
    id: "everyday",
    label: "Everyday",
    description: "Relaxed · Minimal · Scandinavian",
    seedAffinity: { relaxed: 2, neutral: 2, layer: 1, knitwear: 1 },
  },
  {
    id: "work",
    label: "Work",
    description: "Tailored · Clean · Sophisticated",
    seedAffinity: { tailoring: 3, neutral: 2, black: 1 },
  },
  {
    id: "vacation",
    label: "Vacation",
    description: "Linen · Relaxed · Mediterranean",
    seedAffinity: { natural: 3, relaxed: 2, neutral: 1 },
  },
];

export const DEFAULT_STYLE_ID = PERSONAL_STYLES[0].id;

export function styleById(id: string): PersonalStyle {
  return PERSONAL_STYLES.find((s) => s.id === id) ?? PERSONAL_STYLES[0];
}

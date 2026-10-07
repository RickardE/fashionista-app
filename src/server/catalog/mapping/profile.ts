/**
 * MappingProfile: the configurable bridge from one source's vocabulary into
 * STYLEAI's canonical vocabulary. A profile only *extends/overrides* the shared
 * base dictionaries, so adding a new source is mostly declaring its quirks.
 */

import type { Availability, CanonicalColor, Condition, Gender } from "../types";
import {
  BASE_AVAILABILITY,
  BASE_CATEGORY_RULES,
  BASE_COLORS,
  BASE_CONDITIONS,
  BASE_GENDERS,
  type CategoryRule,
} from "./dictionaries";

export type { CategoryRule };

export interface MappingProfile {
  colors?: Record<string, CanonicalColor>;
  genders?: Record<string, Gender>;
  availability?: Record<string, Availability>;
  conditions?: Record<string, Condition>;
  /** Source-specific category rules, tried before the shared base rules. */
  categoryRules?: CategoryRule[];
  /** Category paths matching any of these are ignored (campaign/internal trees). */
  ignoredCategoryPaths?: RegExp[];
  /** Path segments that never carry category meaning (e.g. "Kläder", "Man"). */
  ignoredCategorySegments?: RegExp[];
  /** Separator used in the source's category paths. Defaults to ">". */
  categorySeparator?: string;
}

export interface ResolvedMapping {
  colors: Record<string, CanonicalColor>;
  genders: Record<string, Gender>;
  availability: Record<string, Availability>;
  conditions: Record<string, Condition>;
  categoryRules: CategoryRule[];
  ignoredCategoryPaths: RegExp[];
  ignoredCategorySegments: RegExp[];
  categorySeparator: string;
}

export function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function lowerKeys<T>(record: Record<string, T> = {}): Record<string, T> {
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [normalizeKey(k), v]));
}

/** Merges a source profile over the shared base dictionaries. */
export function resolveMapping(profile: MappingProfile = {}): ResolvedMapping {
  return {
    colors: { ...lowerKeys(BASE_COLORS), ...lowerKeys(profile.colors) },
    genders: { ...lowerKeys(BASE_GENDERS), ...lowerKeys(profile.genders) },
    availability: { ...lowerKeys(BASE_AVAILABILITY), ...lowerKeys(profile.availability) },
    conditions: { ...lowerKeys(BASE_CONDITIONS), ...lowerKeys(profile.conditions) },
    categoryRules: [...(profile.categoryRules ?? []), ...BASE_CATEGORY_RULES],
    ignoredCategoryPaths: profile.ignoredCategoryPaths ?? [],
    ignoredCategorySegments: profile.ignoredCategorySegments ?? [],
    categorySeparator: profile.categorySeparator ?? ">",
  };
}

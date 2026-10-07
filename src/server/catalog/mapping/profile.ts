/**
 * MappingProfile: the configurable bridge from one source's vocabulary into
 * STYLEAI's canonical vocabulary. A profile only *extends/overrides* the shared
 * base dictionaries, so adding a new source is mostly declaring its quirks.
 */

import type { Availability, CanonicalColor, Category, Condition, Gender } from "../types";
import {
  BASE_AVAILABILITY,
  BASE_BRAND_CATEGORIES,
  BASE_DECISIVE_RULES,
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
  /** Rules that decide the category from title/description before anything else. */
  decisiveRules?: CategoryRule[];
  /** Category paths matching any of these are ignored (campaign/internal trees). */
  ignoredCategoryPaths?: RegExp[];
  /** Path segments that never carry category meaning (e.g. "Kläder", "Man"). */
  ignoredCategorySegments?: RegExp[];
  /**
   * Segments that introduce a brand index (e.g. "Varumärken"): the segment right
   * after one is a brand name, never a category ("Varumärken > Polo Ralph Lauren").
   */
  brandIndexSegments?: RegExp[];
  /** Separator used in the source's category paths. Defaults to ">". */
  categorySeparator?: string;
  /** Single-category brands (lower-case name → category), over the shared ones. */
  brandCategories?: Record<string, { category: Category; subcategory?: string }>;
}

export interface ResolvedMapping {
  colors: Record<string, CanonicalColor>;
  genders: Record<string, Gender>;
  availability: Record<string, Availability>;
  conditions: Record<string, Condition>;
  categoryRules: CategoryRule[];
  decisiveRules: CategoryRule[];
  ignoredCategoryPaths: RegExp[];
  ignoredCategorySegments: RegExp[];
  brandIndexSegments: RegExp[];
  categorySeparator: string;
  brandCategories: Record<string, { category: Category; subcategory?: string }>;
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
    decisiveRules: [...(profile.decisiveRules ?? []), ...BASE_DECISIVE_RULES],
    ignoredCategoryPaths: profile.ignoredCategoryPaths ?? [],
    ignoredCategorySegments: profile.ignoredCategorySegments ?? [],
    brandIndexSegments: profile.brandIndexSegments ?? [],
    categorySeparator: profile.categorySeparator ?? ">",
    brandCategories: { ...lowerKeys(BASE_BRAND_CATEGORIES), ...lowerKeys(profile.brandCategories) },
  };
}

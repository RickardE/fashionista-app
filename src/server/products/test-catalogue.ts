/**
 * Optional restriction of the whole app to an approved test catalogue, for
 * controlled user tests.
 *
 *   TEST_CATALOGUE unset or empty   → off: every query sees the full catalogue
 *   TEST_CATALOGUE=<name>           → every product query (feeds, outfit
 *                                     candidates, search, inspiration, lookups
 *                                     by id) sees only the products listed in
 *                                     test-catalogues/<name>.json that also have
 *                                     a current, completed active enrichment
 *
 * An unknown name fails closed (throws) rather than silently showing the full
 * catalogue. Catalogues are committed files so the approved list is reviewable.
 */

import { and, inArray, type SQL } from "drizzle-orm";
import { products } from "@/server/db/schema";
import { recommendationReady } from "@/server/enrichment/state";
import userTest1 from "./test-catalogues/user-test-1.json";

export interface TestCatalogue {
  name: string;
  ids: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function load(file: { name: string; products: { id: string }[] }): TestCatalogue {
  const ids = file.products.map((p) => p.id);
  const bad = ids.filter((id) => !UUID.test(id));
  if (bad.length) throw new Error(`Test catalogue ${file.name} has malformed ids: ${bad.join(", ")}`);
  if (new Set(ids).size !== ids.length) throw new Error(`Test catalogue ${file.name} lists a product twice`);
  return { name: file.name, ids };
}

export const TEST_CATALOGUES: Record<string, TestCatalogue> = {
  "user-test-1": load(userTest1),
};

/** The active test catalogue, or null when the restriction is off. */
export function activeTestCatalogue(env: Record<string, string | undefined> = process.env): TestCatalogue | null {
  const name = env.TEST_CATALOGUE?.trim();
  if (!name) return null;
  const catalogue = TEST_CATALOGUES[name];
  if (!catalogue) {
    throw new Error(`TEST_CATALOGUE="${name}" is not a known test catalogue (known: ${Object.keys(TEST_CATALOGUES).join(", ")})`);
  }
  return catalogue;
}

/**
 * The SQL condition every product query adds: undefined (no restriction) when
 * the restriction is off; otherwise listed ids that are recommendation-ready.
 */
export function testCatalogueScope(env?: Record<string, string | undefined>): SQL | undefined {
  const catalogue = activeTestCatalogue(env);
  if (!catalogue) return undefined;
  return and(inArray(products.id, catalogue.ids), recommendationReady);
}

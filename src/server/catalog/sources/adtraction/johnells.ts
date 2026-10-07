/**
 * Johnells (SE) via Adtraction. Everything Johnells-specific lives here: the
 * source identity and the quirks of its category tree and vocabulary.
 */

import type { MappingProfile } from "../../mapping/profile";
import { AdtractionFeedSource } from "./adtraction-feed-source";

export const JOHNELLS_MAPPING: MappingProfile = {
  categorySeparator: ">",
  // Campaign / internal merchandising trees say nothing about what a product is.
  ignoredCategoryPaths: [/kampanj/i, /interna? kategori/i],
  // Navigation-only segments; gender is read from the raw path separately.
  ignoredCategorySegments: [
    /^(man|dam|herr|kvinna|unisex|kläder|nyheter|rea|sale|outlet|varumärken|märken|alla .*|visa alla|bästsäljare)$/i,
  ],
};

export function createJohnellsSource(env: NodeJS.ProcessEnv = process.env) {
  return new AdtractionFeedSource({
    identity: { key: "adtraction:johnells", provider: "adtraction", merchant: "Johnells" },
    feedUrl: env.ADTRACTION_JOHNELLS_FEED_URL,
    feedUrlEnv: "ADTRACTION_JOHNELLS_FEED_URL",
    mapping: JOHNELLS_MAPPING,
    defaultCurrency: "SEK",
  });
}

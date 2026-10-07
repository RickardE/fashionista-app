import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildEnrichmentInput, type EnrichableProduct } from "../input";
import { buildUserPrompt, SYSTEM_PROMPT } from "../prompt";

const product: EnrichableProduct = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "  Linen Shirt ",
  description: "Skjorta i  linne.\n Avslappnad passform.",
  brand: "Example",
  productType: "clothing",
  category: "shirts",
  subcategory: "linen shirt",
  gender: "men",
  colors: ["beige"],
  images: ["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.jpg"],
  sourceAttributes: {
    colorsRaw: ["Sand"],
    material: "100% linen",
    categoryPaths: ["A > B", "C > D", "E > F", "G > H"],
  },
  contentHash: "abc",
};

describe("buildEnrichmentInput", () => {
  it("maps normalized fields and source facts, normalizing whitespace", () => {
    const input = buildEnrichmentInput(product);
    expect(input.product).toEqual({
      name: "Linen Shirt",
      brand: "Example",
      description: "Skjorta i linne. Avslappnad passform.",
      product_type: "clothing",
      category: "shirts",
      subcategory: "linen shirt",
      gender: "men",
      colours: ["beige"],
    });
    expect(input.source_facts).toEqual({
      colour_names: ["Sand"],
      material: "100% linen",
      pattern: null,
      category_paths: ["A > B", "C > D", "E > F"],
      taxonomy_path: null,
    });
    expect(input.image_url).toBe("https://cdn.example.com/a.jpg");
  });

  it("tolerates missing or partial sourceAttributes and missing images", () => {
    const input = buildEnrichmentInput({
      ...product,
      description: null,
      brand: null,
      images: [],
      sourceAttributes: {} as EnrichableProduct["sourceAttributes"],
    });
    expect(input.product.description).toBeNull();
    expect(input.source_facts).toEqual({ colour_names: [], material: null, pattern: null, category_paths: [], taxonomy_path: null });
    expect(input.image_url).toBeNull();
    expect(buildUserPrompt(input)).toContain("No product image");
  });

  it("truncates very long descriptions", () => {
    const input = buildEnrichmentInput({ ...product, description: "x".repeat(5000) });
    expect(input.product.description!.length).toBeLessThanOrEqual(1501);
  });

  it("never passes merchant URLs, offers or raw rows to the model", () => {
    const keys = JSON.stringify(Object.keys(buildEnrichmentInput(product).product));
    expect(keys).not.toMatch(/url|offer|merchant|raw|price/i);
  });
});

describe("provider and merchant neutrality", () => {
  const dir = path.join(__dirname, "..");
  const sources = readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".ts") && !f.includes("__tests__"))
    .map((f) => [f, readFileSync(path.join(dir, f), "utf8")] as const);

  it("has no source-, merchant- or affiliate-specific code in the enrichment layer", () => {
    for (const [file, text] of sources) expect(text, file).not.toMatch(/johnells|adtraction|source_key ===|sourceKey ===/i);
  });

  it("does not hardcode preset Style names in the prompt", () => {
    expect(SYSTEM_PROMPT).not.toMatch(/\b(Everyday|Work|Vacation) Style\b/);
  });

  it("keeps provider SDKs inside provider adapters", () => {
    for (const [file, text] of sources) {
      if (file.startsWith("providers")) continue;
      expect(text, file).not.toMatch(/@anthropic-ai\/sdk|from "openai"/);
    }
  });
});

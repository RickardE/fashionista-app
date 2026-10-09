import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { importFromSource } from "@/server/catalog/ingest";
import { createTestDb, memorySource, silentLogger } from "@/server/catalog/__tests__/helpers";
import { FULL_FEED } from "@/server/catalog/__tests__/fixtures/feed";
import type { Db } from "@/server/db/client";
import { enrichmentRuns, productEnrichments, productEnrichmentState, products } from "@/server/db/schema";
import { getProduct, listProducts } from "../service";
import { deriveTags } from "../tags";
import { parseActiveEnrichment } from "../enrichment";
import { activateEnrichment, attributes } from "./enrichment-helpers";

let db: Db;
let close: () => Promise<void>;
let shirt: string;
let trousers: string;
let originalHash: string;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await importFromSource(db, memorySource(FULL_FEED), { logger: silentLogger });
  const idOf = async (name: string) => (await db.select().from(products).where(eq(products.name, name)))[0];
  const s = await idOf("Linneskjorta Relaxed");
  shirt = s.id;
  originalHash = s.contentHash;
  trousers = (await idOf("Wool Trousers")).id;
});
afterAll(async () => {
  await close();
});
beforeEach(async () => {
  await db.delete(productEnrichmentState);
  await db.delete(productEnrichments);
  await db.delete(enrichmentRuns);
  await db.update(products).set({ contentHash: originalHash }).where(eq(products.id, shirt));
});

const SUMMARY_KEYS = ["aesthetics", "colourPrimary", "colourProfile", "fit", "formality", "garmentType", "pattern", "seasons", "taxonomyVersion"];

describe("enrichment summary on products", () => {
  it("exposes only the summary fields of the current active enrichment, apart from catalogue facts", async () => {
    const before = await getProduct(db, shirt);
    await activateEnrichment(db, shirt, attributes({ garment_type: "casual_shirt", fit: "relaxed", colour_primary: "white", colour_profile: "neutral_light", materials: [{ value: "linen", evidence: "stated" }] }));
    const after = (await getProduct(db, shirt))!;

    expect(Object.keys(after.enrichment!).sort()).toEqual(SUMMARY_KEYS);
    expect(after.enrichment).toMatchObject({ garmentType: "casual_shirt", fit: "relaxed", colourPrimary: "white", formality: 3, taxonomyVersion: expect.any(String) });
    // Catalogue facts are untouched: the existing contract only gains `enrichment` (and enrichment-based tags).
    const facts = (p: object) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== "enrichment" && k !== "tags"));
    expect(facts(after)).toEqual(facts(before!));
    expect(JSON.stringify(after)).not.toMatch(/summary|confidence|raw|materials|taxonomy_gaps|category_check/);
  });

  it("includes the leg shape for legwear and omits it otherwise, and for results made before taxonomy 1.1", async () => {
    await activateEnrichment(db, trousers, attributes({ garment_type: "tailored_trousers", leg_shape: "wide" }));
    expect((await getProduct(db, trousers))!.enrichment?.legShape).toBe("wide");
    await activateEnrichment(db, shirt, attributes({ leg_shape: "not_applicable" }));
    expect((await getProduct(db, shirt))!.enrichment).not.toHaveProperty("legShape");
    const v100: Record<string, unknown> = { ...attributes() };
    delete v100.leg_shape;
    await activateEnrichment(db, shirt, v100);
    expect((await getProduct(db, shirt))!.enrichment).toMatchObject({ garmentType: "oxford_shirt" });
  });

  it("is absent without an enrichment, when the enrichment is stale, and when it is malformed", async () => {
    expect((await getProduct(db, shirt))!.enrichment).toBeUndefined();

    await activateEnrichment(db, shirt);
    await db.update(products).set({ contentHash: "edited" }).where(eq(products.id, shirt));
    expect((await getProduct(db, shirt))!.enrichment).toBeUndefined();

    await db.update(products).set({ contentHash: originalHash }).where(eq(products.id, shirt));
    await activateEnrichment(db, shirt, { formality: "smart" });
    expect((await getProduct(db, shirt))!.enrichment).toBeUndefined();
  });

  it("never shows a result that is not the active completed one", async () => {
    await activateEnrichment(db, shirt, attributes({ formality: 2 }));
    // A later needs_review attempt is stored but must not replace what is shown.
    const [{ id: runId }] = await db.select({ id: enrichmentRuns.id }).from(enrichmentRuns);
    await db.insert(productEnrichments).values({
      productId: shirt, runId, taxonomyVersion: "x", promptVersion: "x", provider: "mock", model: "mock",
      inputContentHash: originalHash, outcome: "needs_review", input: {}, attributes: { ...attributes({ formality: 5 }) }, confidences: {},
    });
    expect((await getProduct(db, shirt))!.enrichment?.formality).toBe(2);
  });

  it("reaches outfit candidates too", async () => {
    await activateEnrichment(db, trousers, attributes({ garment_type: "chinos", formality: 2 }));
    const list = await listProducts(db, { categories: ["trousers"], limit: 10 });
    expect(list.find((p) => p.id === trousers)?.enrichment?.garmentType).toBe("chinos");
  });
});

describe("style tags", () => {
  const facts = { name: "Shirt", category: "shirts", colors: ["black"], description: "Relaxed linen shirt" };
  const stored = (overrides: Parameters<typeof attributes>[0]) => parseActiveEnrichment({ taxonomy_version: "1.2.0", attributes: attributes(overrides) })!;

  it("keeps the catalogue heuristic when there is no enrichment", () => {
    expect(deriveTags(facts).sort()).toEqual(["black", "natural", "neutral", "relaxed"]);
  });

  it("derives attribute tags from the enrichment instead of title words", () => {
    const tags = deriveTags(facts, stored({ fit: "slim", colour_primary: "white", colour_profile: "neutral_light", materials: [{ value: "cotton", evidence: "stated" }] }));
    expect(tags.sort()).toEqual(["neutral"]);
    expect(deriveTags(facts, stored({ fit: "oversized", materials: [{ value: "wool", evidence: "inferred" }, { value: "suede", evidence: "stated" }] })).sort())
      .toEqual(["leather", "natural", "neutral", "oversized"]);
  });

  it("maps tailoring, layering and wide legs, and keeps category tags from catalogue facts", () => {
    expect(deriveTags({ ...facts, category: "trousers" }, stored({ garment_type: "tailored_trousers", leg_shape: "wide", formality: 4 })))
      .toEqual(expect.arrayContaining(["tailoring", "wide"]));
    expect(deriveTags({ ...facts, category: "knitwear" }, stored({ garment_type: "cardigan" }))).toEqual(expect.arrayContaining(["knitwear", "layer"]));
    expect(deriveTags({ ...facts, category: "shoes" }, stored({ garment_type: "sneakers", fit: "not_applicable" }))).toContain("shoes");
  });
});

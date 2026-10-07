import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, silentLogger } from "@/server/catalog/__tests__/helpers";
import type { Db } from "@/server/db/client";
import { enrichmentRuns, productEnrichments, productEnrichmentState, products } from "@/server/db/schema";
import { runEnrichment } from "../pipeline";
import { computeRunStats } from "../report";
import { inputConsistency, loadReviewData, parseCsv, reviewCsv, reviewHtml } from "../review";
import {
  claimProducts,
  countRecommendationReady,
  selectProductsToEnrich,
  statusCounts,
} from "../state";
import { insertProduct, mockProvider, modelOutput, ok, usage } from "./fixtures";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(async () => {
  await close();
});
beforeEach(async () => {
  await db.execute(sql`truncate product_enrichment_state, product_enrichments, enrichment_runs, products cascade`);
});

const run = (provider: ReturnType<typeof mockProvider>, productIds: string[], kind: "incremental" | "pilot" = "incremental") =>
  runEnrichment(db, { kind, provider, productIds, logger: silentLogger, concurrency: 2 });

const stateOf = async (id: string) =>
  (await db.select().from(productEnrichmentState).where(eq(productEnrichmentState.productId, id)))[0];

describe("selection", () => {
  it("selects only eligible, active clothing/shoes with images", async () => {
    const shirt = await insertProduct(db);
    const shoe = await insertProduct(db, { productType: "shoes", category: "shoes" });
    await insertProduct(db, { productType: "underwear", category: "underwear" });
    await insertProduct(db, { productType: "accessories", category: "accessories" });
    await insertProduct(db, { status: "inactive" });
    await insertProduct(db, { images: [] });
    expect((await selectProductsToEnrich(db)).sort()).toEqual([shirt, shoe].sort());
  });
});

describe("production run", () => {
  it("enriches, persists append-only results, and activates completed ones", async () => {
    const id = await insertProduct(db);
    const provider = mockProvider(() => ok(modelOutput()));
    const { runId, stats } = await run(provider, [id]);

    expect(stats).toMatchObject({ products: 1, completed: 1, failed: 0, calls: 1, input_tokens: usage.inputTokens });
    expect(stats.cost_usd_micros).toBeNull(); // the mock model has no price
    const [row] = await db.select().from(productEnrichments).where(eq(productEnrichments.runId, runId));
    expect(row).toMatchObject({ outcome: "completed", provider: "mock", model: "mock-model", inputContentHash: expect.any(String) });
    expect(row.attributes).toMatchObject({ garment_type: "oxford_shirt", formality: 3 });
    expect(row.confidences).toMatchObject({ garment_type: "high", aesthetics: { classic: "high" } });
    expect(row.imageUrl).toMatch(/^https:\/\/images\.example\.com/);
    expect(provider.calls[0].image).toEqual({ kind: "url", url: row.imageUrl });

    const state = await stateOf(id);
    expect(state).toMatchObject({ status: "completed", activeEnrichmentId: row.id, attempts: 1, lockedAt: null });
    expect(await countRecommendationReady(db)).toBe(1);
    expect(await selectProductsToEnrich(db)).toEqual([]);

    const [runRow] = await db.select().from(enrichmentRuns).where(eq(enrichmentRuns.id, runId));
    expect(runRow.status).toBe("succeeded");
    expect(runRow.finishedAt).not.toBeNull();
  });

  it("never mutates source facts or the normalized category", async () => {
    const id = await insertProduct(db, { colors: ["navy"] });
    const before = (await db.select().from(products).where(eq(products.id, id)))[0];
    await run(
      mockProvider(() =>
        ok(
          modelOutput({
            colour_primary: { value: "black", confidence: "high" },
            category_check: { verdict: "disagrees", suggested_category: "outerwear", confidence: "high" },
          }),
        ),
      ),
      [id],
    );
    const after = (await db.select().from(products).where(eq(products.id, id)))[0];
    expect(after).toEqual(before);
    expect((await stateOf(id)).status).toBe("needs_review");
  });

  it("marks products pending again when their content changes", async () => {
    const id = await insertProduct(db);
    await run(mockProvider(() => ok(modelOutput())), [id]);
    await db.update(products).set({ contentHash: "changed" }).where(eq(products.id, id));

    expect(await selectProductsToEnrich(db)).toEqual([id]);
    expect((await statusCounts(db)).pending).toBe(1);
    // The old enrichment describes old content: no longer recommendation-ready.
    expect(await countRecommendationReady(db)).toBe(0);
  });

  it("marks products pending when the taxonomy or prompt version moves on", async () => {
    const id = await insertProduct(db);
    await run(mockProvider(() => ok(modelOutput())), [id]);
    expect(await selectProductsToEnrich(db, { versions: { taxonomyVersion: "9.9.9", promptVersion: "1.0.0" } })).toEqual([id]);
    expect(await selectProductsToEnrich(db)).toEqual([]);
  });

  it("keeps the previous active enrichment when a re-run needs review", async () => {
    const id = await insertProduct(db);
    await run(mockProvider(() => ok(modelOutput())), [id]);
    const firstActive = (await stateOf(id)).activeEnrichmentId;
    await run(mockProvider(() => ok(modelOutput({ fit: { value: "slim", confidence: "low" } }))), [id]);
    const state = await stateOf(id);
    expect(state.status).toBe("needs_review");
    expect(state.activeEnrichmentId).toBe(firstActive);
    expect(await db.$count(productEnrichments, eq(productEnrichments.productId, id))).toBe(2);
  });
});

describe("failures and retries", () => {
  it("retries once after a schema failure, with the errors fed back", async () => {
    const id = await insertProduct(db);
    const provider = mockProvider((_req, call) =>
      call === 1 ? ok({ ...modelOutput(), fit: { value: "baggy", confidence: "high" } }) : ok(modelOutput()),
    );
    const { stats } = await run(provider, [id]);
    expect(stats).toMatchObject({ completed: 1, calls: 2, schema_retries: 1, input_tokens: 2 * usage.inputTokens });
    expect(provider.calls[1].userTexts.at(-1)).toContain("fit.value");
  });

  it("fails after a second schema failure", async () => {
    const id = await insertProduct(db);
    const { stats } = await run(mockProvider(() => ok({ nonsense: true })), [id]);
    expect(stats).toMatchObject({ failed: 1, calls: 2, failure_reasons: { schema_invalid: 1 } });
    expect((await stateOf(id)).status).toBe("failed");
  });

  it.each(["refusal", "max_tokens", "provider_error"] as const)("fails immediately on %s", async (reason) => {
    const id = await insertProduct(db);
    const provider = mockProvider(() => ({ ok: false, reason, message: "nope", usage, latencyMs: 10 }));
    const { stats } = await run(provider, [id]);
    expect(stats).toMatchObject({ failed: 1, calls: 1, failure_reasons: { [reason]: 1 } });
    const state = await stateOf(id);
    expect(state.lastError).toMatch(new RegExp(`^${reason}:`));
    expect(state.activeEnrichmentId).toBeNull();
  });

  it("records unexpected exceptions as failed attempts without aborting the run", async () => {
    const a = await insertProduct(db);
    const b = await insertProduct(db);
    const provider = mockProvider((req) => {
      if (req.userTexts[0].includes(`Oxford Shirt`) && provider.calls.length === 1) throw new Error("kaboom");
      return ok(modelOutput());
    });
    const { stats } = await run(provider, [a, b]);
    expect(stats.products).toBe(2);
    expect(stats.failure_reasons).toEqual({ internal_error: 1 });
  });

  it("does not retry failed products unless asked, and respects max attempts", async () => {
    const id = await insertProduct(db);
    const failing = mockProvider(() => ({ ok: false, reason: "provider_error", message: "down", usage, latencyMs: 1 }));
    await run(failing, [id]);
    expect(await selectProductsToEnrich(db)).toEqual([]);
    expect(await selectProductsToEnrich(db, { retryFailed: true })).toEqual([id]);
    await run(failing, [id]);
    await run(failing, [id]);
    expect((await stateOf(id)).attempts).toBe(3);
    expect(await selectProductsToEnrich(db, { retryFailed: true, maxAttempts: 3 })).toEqual([]);
  });
});

describe("locking", () => {
  it("lets only one claimant take a product", async () => {
    const id = await insertProduct(db);
    expect(await claimProducts(db, [id])).toEqual([id]);
    expect(await claimProducts(db, [id])).toEqual([]);
    expect((await stateOf(id)).status).toBe("processing");
    expect((await statusCounts(db)).processing).toBe(1);
  });

  it("skips products another worker is processing", async () => {
    const id = await insertProduct(db);
    await claimProducts(db, [id]);
    const provider = mockProvider(() => ok(modelOutput()));
    const { stats } = await run(provider, [id]);
    expect(provider.calls).toHaveLength(0);
    expect(stats).toMatchObject({ products: 0, skipped_locked: 1 });
  });

  it("reclaims abandoned claims after the lock timeout", async () => {
    const id = await insertProduct(db);
    await claimProducts(db, [id]);
    await db
      .update(productEnrichmentState)
      .set({ lockedAt: new Date(Date.now() - 60 * 60 * 1000) })
      .where(eq(productEnrichmentState.productId, id));
    expect(await selectProductsToEnrich(db)).toEqual([id]);
    expect(await claimProducts(db, [id])).toEqual([id]);
  });
});

describe("pilot isolation", () => {
  it("leaves existing production state and products byte-identical", async () => {
    const ids = [await insertProduct(db), await insertProduct(db)];
    await run(mockProvider(() => ok(modelOutput())), ids); // production run creates state
    const snapshot = async () => ({
      state: await db.select().from(productEnrichmentState).orderBy(productEnrichmentState.productId),
      products: await db.select().from(products).orderBy(products.id),
      ready: await countRecommendationReady(db),
      pending: await selectProductsToEnrich(db),
    });
    const before = await snapshot();
    // A pilot whose output would demote the products if it were applied.
    await run(mockProvider(() => ok(modelOutput({ fit: { value: "slim", confidence: "low" } }))), ids, "pilot");
    await run(mockProvider(() => ({ ok: false, reason: "refusal", message: "x", usage, latencyMs: 1 })), ids, "pilot");
    expect(await snapshot()).toEqual(before);
  });

  it("does not claim or skip products a production worker holds", async () => {
    const id = await insertProduct(db);
    await claimProducts(db, [id]);
    const provider = mockProvider(() => ok(modelOutput()));
    const { stats } = await run(provider, [id], "pilot");
    expect(provider.calls).toHaveLength(1);
    expect(stats.products).toBe(1);
    expect((await stateOf(id)).status).toBe("processing");
  });
});

describe("input fingerprints", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("records the request hash and, inline, the image bytes' SHA-256", async () => {
    const id = await insertProduct(db);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    vi.stubGlobal("fetch", async () => new Response(jpeg, { headers: { "content-type": "image/jpeg" } }));
    const provider = mockProvider(() => ok(modelOutput()));
    const { runId } = await runEnrichment(db, { kind: "pilot", provider, productIds: [id], imageMode: "inline", logger: silentLogger });
    const [row] = await db.select().from(productEnrichments).where(eq(productEnrichments.runId, runId));
    const input = row.input as { request_sha256: string; image: { sha256: string; bytes: number; mode: string } };
    expect(input.request_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(input.image).toMatchObject({ mode: "inline", bytes: jpeg.length, sha256: createHash("sha256").update(jpeg).digest("hex") });
    expect(provider.calls[0].image).toEqual({ kind: "base64", mediaType: "image/jpeg", data: jpeg.toString("base64") });
  });

  it("records image download failures as failed attempts", async () => {
    const id = await insertProduct(db);
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 404 }));
    const provider = mockProvider(() => ok(modelOutput()));
    const { stats } = await runEnrichment(db, { kind: "pilot", provider, productIds: [id], imageMode: "inline", logger: silentLogger });
    expect(provider.calls).toHaveLength(0);
    expect(stats.failure_reasons).toEqual({ image_error: 1 });
  });
});

describe("pilot runs", () => {
  it("record results for comparison without touching production state", async () => {
    const ids = [await insertProduct(db), await insertProduct(db)];
    const opus = mockProvider(() => ok(modelOutput()), { provider: "anthropic", model: "claude-opus-5-5" });
    const other = mockProvider(() => ok(modelOutput({ fit: { value: "slim", confidence: "high" } })), { provider: "openai", model: "x" });
    const a = await run(opus, ids, "pilot");
    const b = await run(other, ids, "pilot");

    expect(await db.$count(productEnrichmentState)).toBe(0);
    expect(await countRecommendationReady(db)).toBe(0);
    // Same products, same input, different models.
    expect(opus.calls.map((c) => c.userTexts[0])).toEqual(other.calls.map((c) => c.userTexts[0]));
    expect(opus.calls.map((c) => [c.system, c.jsonSchema])).toEqual(other.calls.map((c) => [c.system, c.jsonSchema]));
    const data = await loadReviewData(db, [a.runId, b.runId]);
    expect(inputConsistency(data)).toMatchObject({ compared: 2, identical: 2, differing: [] });

    // Review artifacts label each run and line answers up per field.
    const html = reviewHtml(data);
    expect(html).toContain(`Run ${a.runId} · anthropic:claude-opus-5-5`);
    expect(html).toContain(`Run ${b.runId} · openai:x`);
    expect(html).toContain("2/2 products received identical input");
    const csv = parseCsv(reviewCsv(data));
    expect(Object.keys(csv[0])).toEqual(expect.arrayContaining(["correct", "expected_value", "notes", "image_url"]));
    expect(csv.slice(0, 2).map((r) => [r.field, r.run_id])).toEqual([
      ["garment_type", String(a.runId)],
      ["garment_type", String(b.runId)],
    ]);

    // A product whose content changes between runs is reported as inconsistent.
    await db.update(products).set({ contentHash: "edited" }).where(eq(products.id, ids[0]));
    const c = await run(opus, ids, "pilot");
    const drift = inputConsistency(await loadReviewData(db, [a.runId, c.runId]));
    expect(drift.differing).toEqual([expect.objectContaining({ productId: ids[0], differs: ["catalogue content"] })]);
    expect(a.stats.cost_usd_micros).toBe(2 * (1000 * 4 + 200 * 20 + 2000 * 0.2));
    expect(b.stats).toMatchObject({ completed: 2, unpriced: 2, cost_usd_micros: null });
    const recomputed = await computeRunStats(db, a.runId);
    expect(recomputed.latency_p50_ms).toBe(100);
  });
});

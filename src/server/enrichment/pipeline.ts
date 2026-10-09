/**
 * The enrichment pipeline:
 *
 *   select → claim → input → model → validate (→ one schema retry) → gate
 *          → persist (append-only) → update state → run stats
 *
 * Provider-neutral: it sees a ModelProvider, parsed JSON and normalized usage.
 * Production runs (backfill, incremental) claim products and update their
 * state; pilot runs only append results so several models can be compared on
 * the same products without touching what recommendation consumers read.
 */

import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import {
  enrichmentRuns,
  productEnrichments,
  products,
  type EnrichmentOutcome,
  type EnrichmentRunKind,
} from "@/server/db/schema";
import { createLogger, type Logger } from "@/server/log";
import { resolveImage, type ImageMode } from "./images";
import { buildEnrichmentInput, type EnrichableProduct } from "./input";
import { costUsdMicros, priceFor } from "./pricing";
import { buildRetryNote, buildUserPrompt, PROMPT_VERSION, SYSTEM_PROMPT } from "./prompt";
import { ZERO_USAGE, type ModelProvider, type ModelRequest, type ModelResult, type ModelUsage } from "./providers/types";
import { computeRunStats } from "./report";
import { claimProducts, recordOutcome, releaseClaims } from "./state";
import { OUTPUT_SCHEMA_NAME, outputJsonSchema, TAXONOMY_VERSION } from "./taxonomy";
import { applyGate, GATE_VERSION } from "./gate";
import { validateOutput } from "./validate";

const DEFAULT_CONCURRENCY = 4;

export interface RunOptions {
  kind: EnrichmentRunKind;
  provider: ModelProvider;
  productIds: string[];
  concurrency?: number;
  imageMode?: ImageMode;
  /** Extra run parameters to record (pilot seed, CLI flags, ...). */
  params?: Record<string, unknown>;
  logger?: Logger;
}

/**
 * A run whose first attempts all fail like this is misconfigured (bad key,
 * unknown model, malformed request) — every further call would fail the same
 * way, so the run stops instead of recording one failure per product.
 */
const FAIL_FAST_AFTER = 3;
const CONFIG_ERROR_STATUSES = new Set([400, 401, 403, 404]);

export interface RunResult {
  runId: number;
  /** Set when the run stopped early (fail-fast); remaining products were not attempted. */
  aborted: string | null;
  stats: Awaited<ReturnType<typeof computeRunStats>> & { skipped_locked: number; not_attempted: number };
}

const addUsage = (a: ModelUsage, b: ModelUsage): ModelUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
});

async function pool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>, stopped: () => boolean) {
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (next < items.length && !stopped()) await fn(items[next++]);
  });
  await Promise.all(workers);
}

export async function runEnrichment(db: Db, opts: RunOptions): Promise<RunResult> {
  const log = opts.logger ?? createLogger("enrichment");
  // Fixed by run kind, never by caller: pilot runs cannot touch production state.
  const activate = opts.kind !== "pilot";
  const { provider } = opts;
  const imageMode = opts.imageMode ?? "url";

  const [run] = await db
    .insert(enrichmentRuns)
    .values({
      kind: opts.kind,
      taxonomyVersion: TAXONOMY_VERSION,
      promptVersion: PROMPT_VERSION,
      provider: provider.config.provider,
      model: provider.config.model,
      effort: provider.config.effort ?? null,
      params: {
        ...opts.params,
        activate,
        gateVersion: GATE_VERSION,
        imageMode,
        concurrency: opts.concurrency ?? DEFAULT_CONCURRENCY,
        maxOutputTokens: provider.config.maxOutputTokens ?? null,
        requested: opts.productIds.length,
      },
    })
    .returning({ id: enrichmentRuns.id });
  const runId = run.id;

  let claimed: string[] = [];
  try {
    claimed = activate ? await claimProducts(db, opts.productIds) : [...new Set(opts.productIds)];
    const skippedLocked = new Set(opts.productIds).size - claimed.length;
    if (skippedLocked) log.warn("products already being processed were skipped", { runId, skippedLocked });

    const rows = claimed.length
      ? await db
          .select({
            id: products.id,
            name: products.name,
            description: products.description,
            brand: products.brand,
            productType: products.productType,
            category: products.category,
            subcategory: products.subcategory,
            gender: products.gender,
            colors: products.colors,
            images: products.images,
            sourceAttributes: products.sourceAttributes,
            contentHash: products.contentHash,
          })
          .from(products)
          .where(inArray(products.id, claimed))
      : [];
    const byId = new Map<string, EnrichableProduct>(rows.map((r) => [r.id, r]));
    // Keep the requested order so pilot runs process products identically.
    const ordered = claimed.map((id) => byId.get(id)).filter((r): r is EnrichableProduct => !!r);

    let done = 0;
    let configFailures = 0;
    let reachedModel = false;
    let aborted: string | null = null;
    await pool(
      ordered,
      opts.concurrency ?? DEFAULT_CONCURRENCY,
      async (product) => {
        const { outcome, configError } = await enrichOne(db, { runId, product, provider, imageMode, activate });
        done++;
        log.info("product enriched", { runId, done, of: ordered.length, product: product.id, outcome });
        if (!configError) reachedModel = true;
        else if (!reachedModel && ++configFailures >= FAIL_FAST_AFTER && !aborted) {
          aborted = `stopped after ${configFailures} consecutive provider errors: ${configError}`;
          log.error("run stopped: provider rejected every request", { runId, reason: configError });
        }
      },
      () => aborted !== null,
    );
    if (aborted && activate) await releaseClaims(db, claimed);

    const stats = {
      ...(await computeRunStats(db, runId)),
      skipped_locked: skippedLocked,
      not_attempted: ordered.length - done,
    };
    await db
      .update(enrichmentRuns)
      .set({ status: aborted ? "failed" : "succeeded", finishedAt: new Date(), stats, error: aborted })
      .where(eq(enrichmentRuns.id, runId));
    return { runId, stats, aborted };
  } catch (err) {
    if (activate) await releaseClaims(db, claimed);
    await db
      .update(enrichmentRuns)
      .set({ status: "failed", finishedAt: new Date(), error: String(err) })
      .where(eq(enrichmentRuns.id, runId));
    throw err;
  }
}

interface Attempt {
  outcome: EnrichmentOutcome;
  /** Provider rejected the request itself (auth/config); message for fail-fast. */
  configError?: string;
  attributes: Record<string, unknown> | null;
  confidences: Record<string, unknown> | null;
  rawOutput: unknown;
  validation: Record<string, unknown>;
  error: string | null;
  usage: ModelUsage;
  latencyMs: number;
  calls: number;
  servedModel?: string;
}

async function enrichOne(
  db: Db,
  ctx: { runId: number; product: EnrichableProduct; provider: ModelProvider; imageMode: ImageMode; activate: boolean },
): Promise<{ outcome: EnrichmentOutcome; configError?: string }> {
  const { product, provider } = ctx;
  const input = buildEnrichmentInput(product);
  const request: ModelRequest = {
    system: SYSTEM_PROMPT,
    userTexts: [buildUserPrompt(input)],
    schemaName: OUTPUT_SCHEMA_NAME,
    jsonSchema: outputJsonSchema(),
  };
  // Stored with the attempt: lets reports prove that compared runs sent
  // identical text, schema and image bytes, whatever the version labels say.
  const recorded: Record<string, unknown> = { ...input, request_sha256: requestHash(request) };

  let attempt: Attempt;
  try {
    const resolved = await resolveImage(input.image_url, ctx.imageMode);
    recorded.image = resolved?.fingerprint ?? null;
    attempt = await callAndValidate(provider, { ...request, image: resolved?.image }, product);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    attempt = recorded.image === undefined
      ? failedAttempt("image_error", message, ZERO_USAGE, 0, 0)
      : failedAttempt("internal_error", message, ZERO_USAGE, 0, 0);
  }

  const cost = costUsdMicros(attempt.usage, priceFor(provider.config.provider, provider.config.model));
  const [row] = await db
    .insert(productEnrichments)
    .values({
      productId: product.id,
      runId: ctx.runId,
      taxonomyVersion: TAXONOMY_VERSION,
      promptVersion: PROMPT_VERSION,
      provider: provider.config.provider,
      model: provider.config.model,
      effort: provider.config.effort ?? null,
      inputContentHash: product.contentHash,
      imageUrl: input.image_url,
      outcome: attempt.outcome,
      input: recorded,
      attributes: attempt.attributes,
      confidences: attempt.confidences,
      rawOutput: attempt.rawOutput ?? null,
      validation: { ...attempt.validation, ...(attempt.servedModel ? { servedModel: attempt.servedModel } : {}) },
      error: attempt.error,
      inputTokens: attempt.usage.inputTokens,
      outputTokens: attempt.usage.outputTokens,
      cacheReadTokens: attempt.usage.cacheReadTokens,
      cacheWriteTokens: attempt.usage.cacheWriteTokens,
      costUsdMicros: cost,
      latencyMs: attempt.latencyMs,
      calls: attempt.calls,
    })
    .returning({ id: productEnrichments.id });

  if (ctx.activate) {
    await recordOutcome(db, {
      productId: product.id,
      enrichmentId: row.id,
      outcome: attempt.outcome,
      contentHash: product.contentHash,
      error: attempt.error,
    });
  }
  return { outcome: attempt.outcome, configError: attempt.configError };
}

/** Fingerprint of everything sent to the model except the image (fingerprinted separately). */
export function requestHash(request: Pick<ModelRequest, "system" | "userTexts" | "schemaName" | "jsonSchema">): string {
  return createHash("sha256")
    .update(JSON.stringify([request.system, request.userTexts, request.schemaName, request.jsonSchema]))
    .digest("hex");
}

function failedAttempt(
  reason: string,
  message: string,
  usage: ModelUsage,
  latencyMs: number,
  calls: number,
  extra: { rawOutput?: unknown; schemaErrors?: string[] } = {},
): Attempt {
  return {
    outcome: "failed",
    attributes: null,
    confidences: null,
    rawOutput: extra.rawOutput ?? null,
    validation: { failureReason: reason, ...(extra.schemaErrors ? { schemaErrors: extra.schemaErrors } : {}) },
    error: `${reason}: ${message}`,
    usage,
    latencyMs,
    calls,
  };
}

async function callAndValidate(provider: ModelProvider, request: ModelRequest, product: EnrichableProduct): Promise<Attempt> {
  const validationCtx = { category: product.category, productType: product.productType, sourceColours: product.colors };

  let usage = ZERO_USAGE;
  let latencyMs = 0;
  let calls = 0;
  let schemaErrors: string[] | undefined;
  let lastRaw: unknown;

  // One initial call plus at most one structured retry after a schema failure.
  for (let round = 0; round < 2; round++) {
    const result: ModelResult = await provider.generate(
      schemaErrors ? { ...request, userTexts: [...request.userTexts, buildRetryNote(schemaErrors)] } : request,
    );
    calls++;
    usage = addUsage(usage, result.usage);
    latencyMs += result.latencyMs;

    if (!result.ok) {
      // invalid_json is a schema-class failure and gets the retry; the rest are final.
      if (result.reason === "invalid_json" && round === 0) {
        schemaErrors = ["output was not valid JSON"];
        lastRaw = result.rawText ?? null;
        continue;
      }
      const failed = failedAttempt(result.reason, result.message, usage, latencyMs, calls, { rawOutput: result.rawText ?? lastRaw });
      if (result.reason === "provider_error" && result.status && CONFIG_ERROR_STATUSES.has(result.status)) {
        failed.configError = `${result.status} ${result.message}`.slice(0, 300);
      }
      return failed;
    }

    lastRaw = result.output;
    const validated = validateOutput(result.output, validationCtx);
    if (!validated.ok) {
      schemaErrors = validated.schemaErrors;
      continue;
    }

    const gate = applyGate(validated);
    const validation: Record<string, unknown> = {
      errors: validated.errors,
      warnings: validated.warnings,
      dropped: validated.dropped,
      gateReasons: gate.reasons,
      gateNotes: gate.notes,
      gateVersion: GATE_VERSION,
      ...(round > 0 ? { retriedAfter: schemaErrors } : {}),
    };
    return {
      outcome: gate.outcome,
      attributes: validated.attributes as unknown as Record<string, unknown>,
      confidences: validated.confidences as unknown as Record<string, unknown>,
      rawOutput: result.output,
      validation,
      error: null,
      usage,
      latencyMs,
      calls,
      servedModel: result.servedModel,
    };
  }

  return failedAttempt("schema_invalid", (schemaErrors ?? []).join("; "), usage, latencyMs, calls, {
    rawOutput: lastRaw,
    schemaErrors,
  });
}

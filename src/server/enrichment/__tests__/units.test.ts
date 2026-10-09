import { afterEach, describe, expect, it } from "vitest";
import { embeddingInputHash, embeddingText } from "../embedding-input";
import { DEFAULT_PILOT_TARGETS, scalePilotTargets, selectPilot, type PilotCandidate } from "../pilot";
import { costUsdMicros, priceFor } from "../pricing";
import { percentile } from "../report";
import { confidenceBucket, evaluateMarkedCsv, parseCsv } from "../review";
import { validateOutput } from "../validate";
import { modelOutput } from "./fixtures";

describe("cost", () => {
  afterEach(() => {
    delete process.env.ENRICHMENT_PRICING_JSON;
  });

  it("computes USD micros from per-million-token prices", () => {
    const price = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };
    // 1000·4 + 500·20 + 2000·0.2 + 100·5 = 4000 + 10000 + 400 + 500
    expect(costUsdMicros({ inputTokens: 1000, outputTokens: 500, cacheReadTokens: 2000, cacheWriteTokens: 100 }, price)).toBe(14900);
  });

  it("defaults cache prices to the input price", () => {
    expect(costUsdMicros({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 10, cacheWriteTokens: 10 }, { input: 1, output: 1 })).toBe(20);
  });

  it("matches Anthropic's published prices (verified 2026-10-07)", () => {
    expect(priceFor("anthropic", "claude-opus-5-5")).toEqual({ input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 });
    expect(priceFor("anthropic", "claude-sonnet-5-5")).toEqual({ input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 });
    expect(priceFor("anthropic", "claude-haiku-4-5-20251001")).toEqual(priceFor("anthropic", "claude-haiku-4-5"));
  });

  it("prices a typical Opus 5.5 pilot call", () => {
    // ~4784 image tokens + ~700 text tokens uncached, ~2k system tokens cached, ~1.5k output.
    const usage = { inputTokens: 5484, outputTokens: 1500, cacheReadTokens: 2000, cacheWriteTokens: 0 };
    expect(costUsdMicros(usage, priceFor("anthropic", "claude-opus-5-5"))).toBe(5484 * 4 + 1500 * 20 + 2000 * 0.2);
  });

  it("returns null for unpriced models", () => {
    expect(priceFor("openai", "some-unlisted-model")).toBeUndefined();
    expect(costUsdMicros({ inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }, undefined)).toBeNull();
  });

  it("takes pricing overrides from the environment", () => {
    process.env.ENRICHMENT_PRICING_JSON = JSON.stringify({ "openai:m": { input: 1, output: 2 } });
    expect(priceFor("openai", "m")).toEqual({ input: 1, output: 2 });
    expect(priceFor("anthropic", "claude-opus-5-5")?.input).toBe(4);
  });
});

describe("percentile", () => {
  it("uses nearest rank", () => {
    const values = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    expect(percentile(values, 50)).toBe(500);
    expect(percentile(values, 95)).toBe(1000);
    expect(percentile([], 50)).toBe(0);
  });
});

describe("selectPilot", () => {
  const brands = Array.from({ length: 30 }, (_, i) => `Brand ${i}`);
  const categories = ["shirts", "t-shirts", "knitwear", "trousers", "jeans", "outerwear", "dresses", "skirts", "tops"];
  const candidates: PilotCandidate[] = Array.from({ length: 400 }, (_, i) => {
    const segment = i % 10 === 0 ? "shoes" : i % 3 === 0 ? "women_clothing" : i === 7 ? "unisex_clothing" : "men_clothing";
    return {
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      segment,
      gender: segment === "shoes" ? ["men", "women", "unisex"][i % 3] : segment.split("_")[0],
      category: segment === "shoes" ? "shoes" : categories[i % categories.length],
      subcategory: segment === "shoes" ? ["sneakers", "boots", null][i % 3] : null,
      brand: brands[i % brands.length],
      thinDescription: i % 11 === 0,
      noColour: i % 37 === 0,
      titleGuessed: i % 5 === 0,
      patterned: i % 13 === 0,
      ambiguous: i % 17 === 0,
    };
  });

  it("is deterministic per seed and independent of input order", () => {
    const a = selectPilot(candidates, "123");
    const b = selectPilot([...candidates].reverse(), "123");
    expect(b.productIds).toEqual(a.productIds);
    expect(selectPilot(candidates, "456").productIds).not.toEqual(a.productIds);
  });

  it("meets segment targets and hard-case minimums", () => {
    const { summary, productIds } = selectPilot(candidates, "123");
    expect(new Set(productIds).size).toBe(productIds.length);
    expect(summary.total).toBe(37);
    for (const s of Object.values(summary.segments)) expect(s.actual).toBe(s.target);
    for (const f of Object.values(summary.flags)) expect(f.actual).toBeGreaterThanOrEqual(f.target);
    expect(summary.brands.actual).toBeGreaterThanOrEqual(15);
    expect(summary.categoriesMissing).toEqual([]);
    const shoes = candidates.filter((c) => productIds.includes(c.id) && c.segment === "shoes");
    expect(new Set(shoes.map((s) => s.gender)).size).toBeGreaterThanOrEqual(2);
    expect(new Set(shoes.map((s) => s.subcategory ?? "unspecified")).size).toBe(3);
  });

  it("gives every sizeable stratum a seat and allocates the rest proportionally", () => {
    // Men: shirts dominate; women: a large and a small category.
    const make = (n: number, segment: PilotCandidate["segment"], category: string, offset: number): PilotCandidate[] =>
      Array.from({ length: n }, (_, i) => ({
        id: `00000000-0000-4000-9000-${String(offset + i).padStart(12, "0")}`,
        segment,
        gender: segment.split("_")[0],
        category,
        subcategory: null,
        brand: `B${(offset + i) % 40}`,
        thinDescription: i < 3,
        noColour: i < 2,
        titleGuessed: i < 4,
        patterned: i < 3,
        ambiguous: i < 3,
      }));
    const pool = [
      ...make(300, "men_clothing", "shirts", 0),
      ...make(30, "men_clothing", "trousers", 1000),
      ...make(12, "men_clothing", "blazers", 2000),
      ...make(3, "men_clothing", "suits", 3000),
      ...make(100, "women_clothing", "dresses", 4000),
      ...make(5, "women_clothing", "skirts", 5000),
    ];
    const targets = { ...DEFAULT_PILOT_TARGETS, segments: { men_clothing: 10, women_clothing: 4, unisex_clothing: 0, shoes: 0 } };
    const { summary } = selectPilot(pool, "7", targets);
    const seats = (segment: string, stratum: string) => summary.strata.find((s) => s.segment === segment && s.stratum === stratum)!.seats;
    expect(seats("men_clothing", "trousers")).toBeGreaterThanOrEqual(1);
    expect(seats("men_clothing", "blazers")).toBeGreaterThanOrEqual(1);
    expect(seats("men_clothing", "shirts")).toBeGreaterThan(seats("men_clothing", "trousers"));
    // Small categories are still covered once somewhere (every clothing category at least once).
    expect(summary.categoriesMissing).toEqual([]);
    expect(summary.total).toBe(14);
  });
});

describe("review CSV", () => {
  it("parses quoted cells", () => {
    expect(parseCsv('a,b\n"x, ""y""",2\n')).toEqual([{ a: 'x, "y"', b: "2" }]);
  });

  it("buckets multi-label confidence by its weakest label", () => {
    expect(confidenceBucket("high")).toBe("high");
    expect(confidenceBucket("minimal:high; classic:medium")).toBe("medium");
    expect(confidenceBucket("")).toBe("none");
  });

  it("scores marked rows into accuracy and calibration", () => {
    const csv = [
      "run_id,provider,model,field,ai_value,confidence,correct,notes",
      "1,anthropic,m,fit,slim,high,y,",
      "1,anthropic,m,fit,regular,low,n,",
      "1,anthropic,m,pattern,solid,high,yes,",
      "1,anthropic,m,pattern,stripe,medium,,",
    ].join("\n");
    const result = evaluateMarkedCsv(csv);
    const key = "anthropic:m (run 1)";
    expect(result.byField[key].fit).toEqual({ marked: 2, correct: 1, accuracy: 0.5 });
    expect(result.byField[key]["(all fields)"]).toEqual({ marked: 3, correct: 2, accuracy: 0.667 });
    expect(result.calibration[key].high).toEqual({ marked: 2, correct: 2, accuracy: 1 });
    expect(result.calibration[key].low).toEqual({ marked: 1, correct: 0, accuracy: 0 });
    expect(result.unmarked).toBe(1);
  });
});

describe("embeddingText", () => {
  it("is built deterministically from validated attributes", () => {
    const v = validateOutput(modelOutput(), { category: "shirts", productType: "clothing", sourceColours: ["navy"] });
    if (!v.ok) throw new Error("invalid fixture");
    const text = embeddingText({ name: "Oxford Shirt", brand: "Example" }, v.attributes);
    expect(text).toContain("type: oxford shirt");
    expect(text).toContain("formality: smart casual");
    expect(embeddingInputHash(text)).toBe(embeddingInputHash(embeddingText({ name: "Oxford Shirt", brand: "Example" }, v.attributes)));
  });
});

describe("scalePilotTargets", () => {
  it("scales segments to the requested size, keeping proportions", () => {
    const t = scalePilotTargets(DEFAULT_PILOT_TARGETS, 46);
    expect(t.segments).toEqual({ men_clothing: 20, women_clothing: 17, unisex_clothing: 1, shoes: 8 });
    expect(t.flags.ambiguous).toBe(6);
    expect(t.minStratumSize).toBe(DEFAULT_PILOT_TARGETS.minStratumSize);
  });

  it("is the identity at the default size", () => {
    expect(scalePilotTargets(DEFAULT_PILOT_TARGETS, 37)).toEqual(DEFAULT_PILOT_TARGETS);
  });
});

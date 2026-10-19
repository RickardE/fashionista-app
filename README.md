# STYLEAI

A fashion discovery app: swipe through real products and complete outfits,
save what you love, and keep separate style profiles (Everyday, Work,
Vacation, your own) that learn from every like and dismiss. Products come from
merchant feeds and are described by an AI enrichment layer. Built from the
visual/UX reference in `reference/`.

**Documentation**

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the system is built and how it works, end to end
- [docs/OPERATIONS.md](docs/OPERATIONS.md) — runbooks: imports, enrichment, pilots, backfill, deploys, the user test
- [docs/DECISIONS.md](docs/DECISIONS.md) — decisions with their evidence, run history, known issues

> Production currently runs the controlled user test (`TEST_CATALOGUE=user-test-1`):
> only the approved test products are shown. Don't run catalogue imports while
> it runs. See [OPERATIONS.md §7](docs/OPERATIONS.md#7-user-test-user-test-1).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Framer Motion ·
Postgres (Neon) via Drizzle · Anthropic/OpenAI vision models for enrichment ·
vitest + PGlite

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Mobile-first — best
viewed at a phone width (e.g. 390×844), though the layout is centered and
usable on desktop too.

## Build

```bash
npm run build
npm start
```

## Deploy

Vercel (app) + Neon (Postgres). The app only reads the catalogue at runtime;
imports, migrations and enrichment run from your machine via the CLI scripts.

1. **Neon connection strings** — in the Neon console, *Connect*: copy the
   pooled string (host contains `-pooler`) and the direct one into `.env.neon`
   (git-ignored):

   ```bash
   DATABASE_URL="postgresql://…-pooler…/neondb?sslmode=require&channel_binding=require"
   DATABASE_URL_UNPOOLED="postgresql://…/neondb?sslmode=require&channel_binding=require"
   ADTRACTION_JOHNELLS_FEED_URL="…"   # same as in .env.local
   ```

2. **Schema + catalogue** (scripts prefer the direct URL):

   ```bash
   ENV_FILE=.env.neon npm run db:migrate
   ENV_FILE=.env.neon npm run products:import
   ```

3. **Vercel** — import the GitHub repo and set `DATABASE_URL` to the *pooled*
   Neon string. Today it is set for Production only, so Preview deployments
   can't serve products. Functions are pinned to `fra1` in `vercel.json`, next
   to the Neon project (AWS eu-central-1, Frankfurt); change both together.
   Nothing else is needed at runtime: feed URLs and model API keys are
   CLI-only. `master` deploys Production.

Product photography is served from the merchant via `next/image`
(`remotePatterns` in `next.config.ts`).

## How it works

A short version; the full description is in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

- **State**: styles, likes, saved products and looks, tag scores, feed
  positions and onboarding progress live in one React Context
  (`src/lib/store/style-profile-context.tsx`), persisted to `localStorage`.
  There are no accounts; nothing about users is stored server-side.
- **Personalization**: every like/dismiss in the Products feed nudges the
  active style's tag scores (`src/lib/personalization.ts`). Those scores (plus
  the style's seed scores) rank the pieces of generated outfits and drive the
  profile's top tags. The Products feed itself is served in a stable catalogue
  order; search is ranked by text relevance.
- **Feeds**: the Products feed swipes clothing (`src/lib/store/use-feed.ts`);
  the Outfits feed composes one complete look per anchor product in the
  browser (`src/lib/store/use-outfit-feed.ts`, `src/lib/outfit-feed.ts`).
- **Outfits**: `src/lib/outfits.ts` fills outerwear / top / bottom / footwear
  slots, ranking candidates by compatibility (formality, season, pattern — from
  AI enrichment where available) and then by the style's tag scores. Swap
  offers ranked alternatives for one slot.
- **Routing**: `/` → `/onboarding` or `/products`; `/products`, `/outfits`,
  `/saved`, `/search`, `/profile`, `/outfit/[id]`, `/product/[id]`,
  `/style/new`, `/style/[id]`. Opening a product inside the app shows it as a
  sliding sheet via an intercepting route; direct links render a full page.

## Backend (catalog)

Postgres (+pgvector) via Drizzle; code lives in `src/server/`.

```bash
cp .env.example .env.local     # then set ADTRACTION_JOHNELLS_FEED_URL
npm run db:up                  # local Postgres in Docker (port 5433)
npm run db:migrate
npm run products:import -- --limit 500   # subset run (never deactivates)
npm run products:import                  # full sync (idempotent)
npm test
```

Pipeline: `ProductSource` adapter (`catalog/sources/*`) → `RawProduct` →
`MappingProfile` normalization → variant grouping by group id → canonical
`products` / `offers` / `variants`. Source rows are kept verbatim in
`raw_items`. Products missing from a full feed become `inactive`; nothing is
deleted. Each run is recorded in `import_runs` with its stats.

### Product API

| Endpoint | Purpose |
|---|---|
| `GET /api/feed?for=products\|outfits&gender=&cursor=&limit=` | Products feed (clothing) or outfit anchors (clothing + shoes) — active, in-stock, stable order, keyset-paginated |
| `GET /api/products?ids=a,b` | Resolve products by id (incl. unavailable — for saved items) |
| `GET /api/products?category=&gender=&exclude=&limit=` | Filter by canonical fields (Build the Look, "more like this") |
| `GET /api/products/:id` | One product (404 if unknown) |
| `GET /api/products/:id/shop` | 302 to the merchant/affiliate URL of the best offer |
| `GET /api/search?q=&limit=` | Keyword search (Postgres full-text) |
| `GET /api/inspiration` | Catalogue images for onboarding / new style |

Responses use the `Product` type in `src/lib/types.ts`: catalogue facts, an
optional `enrichment` summary (AI-inferred, kept apart from the facts) and
style tags. No source ids, offer internals or raw model output are exposed.

**Test catalogue.** For a controlled user test, `TEST_CATALOGUE=<name>`
restricts every endpoint above (except the shop redirect) to the products
listed in `src/server/products/test-catalogues/<name>.json` that have a
current, completed enrichment; anything else resolves as not found. It is
off unless set, and an unknown name fails closed.

### Semantic enrichment

`src/server/enrichment/` describes each catalogue product with a versioned
taxonomy (garment type, fit, colour, pattern, materials, aesthetics, formality,
occasions, seasons, plus QA fields), using a vision model behind a
provider-neutral `ModelProvider` (Anthropic and OpenAI adapters). AI output is
an interpretation layer: it never overwrites source facts or normalized
categories.

```bash
npm run products:enrich-pilot -- --seed 123 --dry-run                     # show the seeded ~40-product sample
npm run products:enrich-pilot -- --seed 123 --provider anthropic --model claude-opus-5-5 --effort low
npm run products:enrich-pilot -- --from-run 1 --provider openai --model <model>   # same products (aborts if their content changed)
npm run products:enrich-report -- --run 1 --run 2 --html --csv            # compare; review sheet in .data/enrichment/
npm run products:enrich-report -- --eval reviewed.csv                     # accuracy + confidence calibration
npm run products:enrich -- --provider … --model … --limit 50              # production: pending/stale products only
npm run products:enrich-report                                            # catalogue status, readiness, recent runs
```

Every attempt is appended to `product_enrichments` (input, raw output,
validation, tokens, cost, latency); `product_enrichment_state` tracks the latest
attempt and the active result per product. A product needs enrichment when it
is new, its `content_hash` changed, or the taxonomy/prompt version moved on.
Pilot runs never change production state, and send images inline so every
model receives byte-identical, SHA-256-fingerprinted images; the report checks
that compared runs had identical input (content, prompt/schema, image). Recommendation-ready = eligible +
an active completed enrichment matching current content (`enrichment/state.ts`).
Model prices live in `enrichment/pricing.ts` (override with `ENRICHMENT_PRICING_JSON`).

Pilot comparison tools: `--attention` (review queue for two runs), `--compare`
(before/after report, replaying each run under every gate version) and
`products:enrich-pilot -- --exclude-run N --size N` (held-out samples). The
validated configuration is Anthropic `claude-opus-5-5` at effort `low`; see
[docs/DECISIONS.md](docs/DECISIONS.md) for the evidence and
[docs/OPERATIONS.md](docs/OPERATIONS.md) for the full workflow, including the
batched full-catalogue backfill.

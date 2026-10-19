# StyleAI architecture

How StyleAI is built and how a product gets from a merchant feed to an outfit
on a user's screen. For step-by-step commands see [OPERATIONS.md](OPERATIONS.md);
for why things are the way they are, see [DECISIONS.md](DECISIONS.md).

The code is the source of truth. Most modules open with a comment that states
their rules; this document connects them and links to them.

---

## 1. The big picture

```
 Merchant feed (Adtraction XML, Johnells SE)
        │  npm run products:import            ← CLI, run from a developer machine
        ▼
 Catalogue in Postgres (Neon)                 products · offers · variants · raw_items
        │  npm run products:enrich*           ← CLI, calls a vision model (Anthropic / OpenAI)
        ▼
 AI enrichment in Postgres                    enrichment_runs · product_enrichments · product_enrichment_state
        │
        ▼
 Product API (Next.js route handlers, Vercel) /api/feed · /api/products · /api/search · /api/inspiration
        │  Product DTO: catalogue facts + optional AI enrichment summary + style tags
        ▼
 Web app (React, runs in the browser)         Products feed · Outfits feed · Build outfit · Swap · Saved · Search
        │  style profiles, likes and saved items in localStorage
        ▼
 Merchant site                                /api/products/:id/shop → 302 to the offer URL
```

Two rules shape everything:

1. **The deployed app only reads.** Imports, migrations and enrichment are CLI
   scripts run from a developer machine against the database. No model API key
   or feed URL is needed (or present) on Vercel.
2. **AI output is an interpretation layer.** It is stored next to the catalogue,
   never written into it. Source facts and normalized categories are only ever
   changed by the import.

### Repository map

| Path | What lives there |
|---|---|
| `src/app/` | Next.js App Router: pages (`(app)/products`, `(app)/outfits`, …) and API route handlers (`api/`) |
| `src/components/` | React components (feed cards, outfit composition, swap sheet, product detail) |
| `src/lib/` | Code shared with the browser: `types.ts` (the `Product` DTO), outfit generation (`outfits.ts`, `outfit-feed.ts`), personalization, client stores (`store/`) |
| `src/server/catalog/` | Feed sources, mapping, normalization, grouping, import |
| `src/server/enrichment/` | Taxonomy, prompt, providers, validation, gate, pipeline, pilot and review tooling |
| `src/server/products/` | Read side: product service, eligibility, enrichment summary, style tags, test catalogue |
| `src/server/db/` | Drizzle schema and client |
| `scripts/` | CLI entry points (`products-import.ts`, `products-enrich*.ts`, `db-migrate.ts`, …) |
| `drizzle/` | SQL migrations |
| `reference/` | Visual/UX reference the app was designed from |

Stack: Next.js 16 (App Router; read `node_modules/next/dist/docs/` before
changing framework code — see `AGENTS.md`), React 19, TypeScript, Tailwind CSS
v4, Framer Motion, Drizzle ORM 0.45 + postgres.js, zod 4, vitest + PGlite.

---

## 2. Catalogue

### 2.1 Sources

A **source** turns a merchant feed into `RawProduct` rows. Sources are
registered by key in [`catalog/sources/registry.ts`](../src/server/catalog/sources/registry.ts);
today there is one, `adtraction:johnells`
([`sources/adtraction/johnells.ts`](../src/server/catalog/sources/adtraction/johnells.ts)),
a Google Shopping–style XML feed fetched over HTTP from the URL in
`ADTRACTION_JOHNELLS_FEED_URL` (it contains an affiliate token — never commit it).

Everything merchant-specific lives in that source file: its identity and its
**mapping profile** (category separator, campaign trees to ignore, navigation
segments to skip, the brand-index segment). The rest of the pipeline is
source-neutral; adding a merchant means adding a source and a profile.

### 2.2 Normalization

[`catalog/normalize.ts`](../src/server/catalog/normalize.ts) maps each raw row
into StyleAI vocabulary using the shared dictionaries in
[`mapping/dictionaries.ts`](../src/server/catalog/mapping/dictionaries.ts)
(Swedish + English) extended by the source profile:

- **colour** → one of the canonical colours (`black`, `navy`, `beige`, … `multi`),
  compound values take the first recognisable token ("Svart/Vit" → black);
- **gender** → men / women / unisex, from the gender field or the first
  category-path segments;
- **availability**, **condition**, sizes, prices, images (http(s) only, de-duplicated);
- **category** → one of the canonical categories (below), with subcategory and
  the source of the decision recorded.

**Category resolution** (`resolveCategory`), in order:

1. **Brand categories** — brands that make only one kind of product
   (Havaianas → shoes/sandals).
2. **Decisive words** in the title or the description's opening — pyjamas,
   swimwear — that settle the category whatever garment is named.
3. **Category paths**, deepest meaningful segment first. Campaign/internal
   trees ("Kampanjer > …") and navigation segments are skipped; brand names are
   stripped from segments. A match on a catch-all (`tops`) is kept only as a
   fallback. A match on a **construction word** (`Half-Zip`) stands unless the
   description's opening names a different specific garment.
4. **Title**. A match on an **ambiguous word** — `boot` ("Kara Boot" jeans),
   `pullover`, a bare `hood` ("Down Hood Jacket") — is only a hint: if the
   description's opening names a different garment and never the title's
   category, the description wins. The description's repetition of the product
   name is ignored as evidence.
5. **Description opening** (the first two sentences, without "■ Modellen…" fit notes).
6. The weak path match, then the secondary taxonomy, then `other`.

Rules are ordered regular expressions; specific compounds come before broad
words, bags before shoes ("väskor" ends in "skor"), material words ("stickat",
"merino") only decide when no garment noun matched. Gloves/mittens and
jewellery are `accessories` with subcategories `gloves` / `jewellery`.

**Category → product type** (`productTypeFor` in
[`catalog/types.ts`](../src/server/catalog/types.ts)): clothing categories,
`shoes`, `bags`, `accessories`, `underwear`, `swimwear`, `loungewear`, `other`.
The product type decides where a product may appear (§5).

### 2.3 Grouping and identity

[`catalog/grouping.ts`](../src/server/catalog/grouping.ts) groups size rows into
products by the feed's group id. Identity (see the header of
[`db/schema.ts`](../src/server/db/schema.ts)):

- **product** — StyleAI-owned uuid, never derived from a source id;
- **offer** — `(source_key, external_group_key)`: one merchant's listing of a product;
- **variant** — `(source_key, external_id)`: one SKU/size row.

Each product has a **`content_hash`** (sha-256 over name, description, brand,
product type, category, subcategory, gender, colours, images and source
attributes — material, pattern, raw colour names, **category paths**, taxonomy
path). Prices and stock live on offers/variants and are *not* part of it.
Enrichment uses this hash to know whether its description is still current.

> Note: category paths include the merchant's campaign trees, so adding a product
> to a campaign changes its hash and makes its enrichment stale. See
> DECISIONS.md → known issues.

### 2.4 Import

[`catalog/ingest.ts`](../src/server/catalog/ingest.ts): fetch → parse → validate
→ normalize → group → upsert → deactivate missing → recompute availability/price.

- **Idempotent** — re-running updates in place.
- **Skips unchanged feeds** — `If-Modified-Since` against the last run, unless `--force`.
- **Fault-isolated** — a failing batch is retried product by product.
- **Non-destructive** — nothing is deleted. Products missing from a *full*,
  healthy feed become `inactive`; deactivation is skipped if the feed is less
  than half the size of the active catalogue (`minRetainRatio` 0.5) unless
  `--force`. Subset runs (`--limit`) never deactivate.
- Source rows are kept verbatim in `raw_items`; every run is recorded in
  `import_runs` with its stats.

---

## 3. Data model

| Table | Purpose |
|---|---|
| `import_runs` | One row per import: source, mode, status, stats, feed Last-Modified |
| `raw_items` | Source rows verbatim, by `(source_key, external_id)` |
| `products` | Canonical products: facts above, `status`, `is_available`, current price, `content_hash`, full-text `search_vector` |
| `offers` | A merchant's listing of a product: URL, price, availability, status |
| `variants` | Sizes/SKUs of an offer, with status |
| `enrichment_runs` | One row per enrichment run: kind (`pilot` / `incremental` / `backfill`), provider, model, effort, taxonomy/prompt version, params (incl. gate version, product ids, seed), status, stats |
| `product_enrichments` | **Append-only**, one row per attempt: input sent (incl. request hash and image SHA-256), raw output, validated attributes and confidences, validation findings and gate reasons/notes, outcome, tokens, cost, latency |
| `product_enrichment_state` | One row per product: status, attempts, lock, the content hash and versions of the last attempt, and **`active_enrichment_id`** — the result the app shows |

Migrations are in `drizzle/` (applied with `npm run db:migrate`).

---

## 4. AI enrichment

Code: [`src/server/enrichment/`](../src/server/enrichment/). Each product is
described once, for everyone, from its catalogue data and its main image.

### 4.1 Pipeline

[`pipeline.ts`](../src/server/enrichment/pipeline.ts):

```
select → claim → build input → model call → validate (→ one schema retry) → gate
       → append attempt → update state (production runs only) → run stats
```

- **Input** ([`input.ts`](../src/server/enrichment/input.ts)) is provider-neutral:
  name, brand, description (max 1,500 chars), product type, StyleAI category,
  subcategory, gender, canonical colours, plus retailer facts verbatim (colour
  names, material, pattern, up to 3 category paths, taxonomy path) and the image.
  The category is evidence the model may disagree with but never change.
- **Images** ([`images.ts`](../src/server/enrichment/images.ts)): `url` mode
  passes the merchant URL to the provider; `inline` mode downloads the image,
  sends it as base64 and records its SHA-256 (used by pilots and recommended
  for production runs). Inline images over **5 MB** (our cap; Anthropic allows
  10 MB) fail the attempt as `image_error`.
- **Prompt** ([`prompt.ts`](../src/server/enrichment/prompt.ts)): a fixed system
  prompt whose glossary is generated from the taxonomy's definitions, plus a
  user message with the input JSON. Bump `PROMPT_VERSION` on any wording change.
- **Providers** ([`providers/`](../src/server/enrichment/providers/)) implement
  `ModelProvider.generate(request) → ModelResult`:
  - Anthropic: Messages API with JSON-schema structured output
    (`output_config.format`), `effort`, the system prompt cached, SDK retries for
    429/5xx, optional `ANTHROPIC_WORKSPACE_ID` header. Server-side refusal
    fallbacks are deliberately **off** (they would silently answer with another
    model and corrupt comparisons).
  - OpenAI: Responses API with strict JSON schema.
- **Retry**: one retry with the schema errors fed back; a second failure is `failed`.
- **Fail-fast**: if the first 3 attempts are all rejected with 400/401/403/404
  and nothing succeeded (bad key, unknown model), the run stops and releases
  its claims instead of recording one failure per product.
- **Cost**: tokens are always stored; cost is computed from
  [`pricing.ts`](../src/server/enrichment/pricing.ts) (USD per million tokens,
  overridable with `ENRICHMENT_PRICING_JSON`). Unpriced models record cost `null`.

### 4.2 Taxonomy

[`taxonomy.ts`](../src/server/enrichment/taxonomy.ts) is the one place allowed
values live; the JSON schema sent to models, the zod validator, the
category ↔ garment-type rules and the prompt glossary all derive from it.

| Field | Values (summary) |
|---|---|
| `garment_type` | 59 types (oxford_shirt, chinos, puffer, loafers, …) + `other`; each category allows a set |
| `fit` | slim · regular · relaxed · oversized · not_applicable (shoes) |
| `leg_shape` *(1.1+)* | skinny · straight · tapered · bootcut · flare · wide · not_applicable |
| `colour_primary`, `colour_secondary` | canonical colours |
| `colour_profile` | neutral_dark · neutral_light · earth · muted · bright · pastel, constrained by colour family |
| `pattern` | solid · stripe · check · print · graphic · texture, judged at outfit distance |
| `materials` | cotton, linen, wool, cashmere, silk, denim, corduroy, leather, suede, shearling *(1.1+)*, viscose, synthetic, down — each `stated` or `inferred` |
| `aesthetics` | 1–3 of 12 defined labels (minimal, classic, preppy, scandinavian, streetwear, …) |
| `formality` | 1 lounge/sport · 2 casual · 3 smart casual · 4 business · 5 formal |
| `occasions`, `seasons` | everyday/work/weekend/evening/vacation/outdoor/event; spring/summer/autumn/winter |
| QA fields | `category_check` (agrees/disagrees + suggestion), `issues` (image problems, not clothing, low information), `summary`, `taxonomy_gaps` |

Every scored value carries a confidence: low · medium · high.

| Version | Change |
|---|---|
| 1.0.0 | Initial taxonomy |
| 1.1.0 | `leg_shape`, `shearling`; definitions for every aesthetic (tight `classic`), pattern rules (glen check = check, micro-patterns = solid), colour profiles by colour family |
| 1.2.0 | Primary-colour rules: hue and profile are separate; indigo denim is blue at any wash, navy is a dyed dark blue |

Results keep the versions that produced them; fields added later are optional
in stored attributes. A version bump marks products pending again.

### 4.3 Validation

[`validate.ts`](../src/server/enrichment/validate.ts):

1. **Schema** (zod, strict enums) — failure → one retry → `failed`.
2. **Normalize** — drop low-confidence multi-value labels (except: when *every*
   aesthetic is low, keep the best one — gate 1.2), dedupe, max 3 aesthetics,
   summary ≤ 200 chars, reset a leg shape on non-legwear. Every change is recorded.
3. **Hard rules** (→ review): garment type `other`; garment type not allowed for
   the category; shoes with a fit; garments without one.
4. **Warnings** (never block): colour disagrees with the source, colour profile
   outside its colour family, denim called navy, legwear without a leg shape,
   formality/season/occasion contradictions, summary truncated.

### 4.4 Quality gate

[`gate.ts`](../src/server/enrichment/gate.ts) decides `completed` vs `needs_review`
(`failed` = no usable output, decided earlier).

A product goes to **review** when: a required value is missing (garment type,
fit, colour, pattern, formality, occasions, seasons, aesthetics); garment type,
colour, pattern, formality or seasons have low confidence; the model disagrees
with the category at medium/high confidence; there is any issue except
`low_information`; or a hard rule fired. **Notes** (stored, non-blocking):
low-confidence fit; aesthetics that are all low-confidence.

| Gate | Change |
|---|---|
| 1.0.0 | Initial |
| 1.1.0 | Low-confidence fit is a note, not a reason |
| 1.2.0 | All-low aesthetics keep the best label and are a note |

The gate version is stored in each run's params and each attempt's validation.
`applyGateAs(version, …)` replays a stored result under any version (used by
the comparison report).

### 4.5 State, activation and readiness

[`state.ts`](../src/server/enrichment/state.ts):

- **Pending is derived**: a product needs enrichment when it has no state row,
  its content hash differs from the last attempt's, or the taxonomy/prompt
  version moved on. Model changes alone never trigger re-enrichment; a gate
  change doesn't either.
- **Claims**: production runs claim products (`FOR UPDATE SKIP LOCKED`); a claim
  older than **15 minutes** is considered abandoned and may be taken again.
  A run claims all its products up front, so keep production batches well under
  15 minutes (OPERATIONS.md uses batches of 150).
- **Activation**: only a **completed** attempt in a **production** run (`incremental`
  or `backfill`) becomes the product's `active_enrichment_id`. A later failed or
  needs_review attempt never replaces it. **Pilot runs never touch state** —
  fixed by run kind in the pipeline, not by the caller.
- **Recommendation-ready** = enrichment candidate (active clothing/shoes with an
  image) + an active completed enrichment whose input content hash equals the
  product's current hash.
- Failed products are retried only with `--retry-failed` (max 3 attempts);
  needs_review products only with `--include-review`.

### 4.6 Evaluation tooling

| Tool | Code | Use |
|---|---|---|
| Stratified pilot | [`pilot.ts`](../src/server/enrichment/pilot.ts) | Seeded, proportional sample across gender × category strata with coverage flags; `--size`, `--exclude-run` (held-out samples exclude earlier products and same-style siblings) |
| Review sheet | [`review.ts`](../src/server/enrichment/review.ts) | HTML/CSV of runs side by side; input-consistency check across runs; accuracy/calibration from a marked CSV |
| Attention report | [`attention.ts`](../src/server/enrichment/attention.ts) | Only what needs a human when comparing two runs; decisions export as CSV |
| Run comparison | [`compare.ts`](../src/server/enrichment/compare.ts) | Before/after report: outcomes, cost, latency, gate-vs-prediction replay, field and confidence changes, scoring against human decisions |

[`embedding-input.ts`](../src/server/enrichment/embedding-input.ts) fixes what
future embeddings will be built from; embeddings are not generated yet.

---

## 5. Read side: product API

### 5.1 Eligibility

[`products/eligibility.ts`](../src/server/products/eligibility.ts) is the single
place for "what may appear where":

- **Products feed** and **search** (and inspiration): `clothing` only.
- **Outfits** (Outfits feed anchors, Build outfit and Swap candidates): `clothing` + `shoes`.
- **Gender**: Men sees men's + unisex, Women sees women's + unisex; unknown gender is left out.
- **Showable**: active, in stock, with an image. Lookups by id also return
  inactive/sold-out products (flagged `available: false`) so saved items resolve.

### 5.2 Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/feed?for=products\|outfits&gender=&cursor=&limit=` | Feed pages in a stable, brand-mixed order (md5 of id), keyset-paginated. Not personalized server-side |
| `GET /api/products?ids=a,b` | Resolve products by id (saved items, outfit links) |
| `GET /api/products?category=&gender=&exclude=&limit=` | Outfit candidates for a slot, "more like this" |
| `GET /api/products/:id` | One product, 404 if unknown |
| `GET /api/products/:id/shop` | 302 to the best offer's merchant URL |
| `GET /api/search?q=&gender=&limit=` | Postgres full-text search (OR of prefix terms, ranked), clothing only |
| `GET /api/inspiration?gender=` | Labelled catalogue images for onboarding and new styles |

Handlers are thin: [`products/service.ts`](../src/server/products/service.ts)
does the queries and maps rows to the `Product` DTO.

### 5.3 The Product DTO

Defined in [`src/lib/types.ts`](../src/lib/types.ts). No source ids or offer
internals are exposed.

- **Catalogue facts**: id, brand, name, price (sale price if lower), currency,
  image, product type, category, subcategory, gender, colour(s), material,
  retailer, sizes, availability, `shopUrl`.
- **`enrichment`** *(optional)* — AI-inferred, kept apart from the facts:
  `taxonomyVersion`, `garmentType`, `fit`, `legShape` (legwear only),
  `colourPrimary`, `colourProfile`, `pattern`, `formality`, `seasons`,
  `aesthetics`. Present only while a completed active enrichment describes the
  product's current content; stale, failed, needs_review, missing or malformed
  results leave it absent ([`products/enrichment.ts`](../src/server/products/enrichment.ts)).
  Raw output, confidences, materials and history never leave the server.
- **`tags`** — coarse style tags (`neutral`, `relaxed`, `oversized`, `wide`,
  `knitwear`, `outerwear`, `tailoring`, `black`, `natural`, `leather`, `shoes`,
  `layer`) used by personalization ([`products/tags.ts`](../src/server/products/tags.ts)).
  Category tags come from catalogue facts; colour, fit, leg, material and
  tailoring tags come from the enrichment when present, otherwise from a
  heuristic over colours and title/description words.

### 5.4 Test catalogue

[`products/test-catalogue.ts`](../src/server/products/test-catalogue.ts): with
`TEST_CATALOGUE=<name>`, **every** query above except the shop redirect is
limited to the ids in `src/server/products/test-catalogues/<name>.json` that are
also recommendation-ready. Anything else resolves as not found (404 for pages
and `/api/products/:id`). Off when unset or empty; an unknown name throws
(fails closed). The condition is evaluated per query, never cached.

---

## 6. The web app

### 6.1 Routes

| Route | Screen |
|---|---|
| `/` | Redirects to `/onboarding` or `/products` |
| `/onboarding`, `/onboarding/upload`, `/onboarding/analysis`, `/onboarding/style` | First run: pick 3–5 inspiration images from the catalogue, a short "analysis" screen (timed, no analysis is performed), the starting style |
| `/products` | Products feed (swipe products) |
| `/outfits` | Outfits feed (swipe whole looks) |
| `/outfit/[id]` | Build outfit around a product (`?items=` reproduces exact pieces) with Swap |
| `/product/[id]` | Product detail; inside the app it opens as a sheet via the `@modal` intercepting route |
| `/search`, `/saved`, `/profile` | Search, saved products and looks, profile |
| `/style/new`, `/style/[id]` | Create / view a style |

Bottom navigation: Products · Outfits · Saved.

### 6.2 State and personalization

All user state lives in the browser. [`store/style-profile-context.tsx`](../src/lib/store/style-profile-context.tsx)
holds it in one React context, persisted to `localStorage` (versioned, with
migrations in `style-profile-migrate.ts`). There are no user accounts and no
server-side user data.

- **Styles**: three presets (Everyday, Work, Vacation — `lib/data/styles.ts`)
  each with seed tag scores, plus user-created styles. Each style learns
  independently and has its own gender, feed position and outfit cursor.
- **Learning**: a like/dismiss in the Products feed adds ±1 to the style's
  score for each of the product's tags. Outfit likes/dismisses update a separate
  outfit score (`outfitAffinity`), which is **recorded but not yet used** for ranking.
- **Effective affinity** = seed scores + learned product scores; it ranks outfit
  pieces (§6.4) and drives the profile's "top tags".
- The Products feed is shown in catalogue order (the API's stable order);
  likes do not reorder it. Search is ranked by the server's text relevance.
- [`store/product-catalog.tsx`](../src/lib/store/product-catalog.tsx) caches every
  product received by id and batch-fetches missing ones (saved items, links).

### 6.3 Feeds

- **Products feed** ([`store/use-feed.ts`](../src/lib/store/use-feed.ts)): pages of
  20 from `/api/feed?for=products`, prefetching when 8 cards remain.
- **Outfits feed** ([`store/use-outfit-feed.ts`](../src/lib/store/use-outfit-feed.ts)):
  anchors in pages of 20 from `/api/feed?for=outfits`; a candidate pool of up to
  50 products per slot per gender, fetched once per session; outfits are
  composed in the browser with `composeOutfits`
  ([`lib/outfit-feed.ts`](../src/lib/outfit-feed.ts)) — one outfit per anchor,
  shown only with ≥ 3 pieces; the last 24 pieces used are held back so
  consecutive outfits differ. At the end of the
  catalogue it starts again from the top.

### 6.4 Outfit generation

[`lib/outfits.ts`](../src/lib/outfits.ts):

- **Slots**: outerwear (outerwear, blazers, suits), top (t-shirts, shirts, polos,
  knitwear, sweatshirts, tops, waistcoats, dresses), bottom (trousers, jeans,
  shorts, skirts), footwear (shoes). Other categories can't anchor or join a look.
- **Order**: the anchor fills its slot; the others are filled in a fixed order
  per anchor slot (e.g. top → bottom, outerwear, footwear).
- **Candidates**: same gender as the anchor (or unisex/unknown), available, not
  already in the look.
- **Ranking**: candidates are ranked by **compatibility level**, then by style
  affinity (sum of the style's scores for the product's tags); ties keep the
  pool order. Compatibility uses enrichment where both pieces have it:
  - *formality* — garments within a span of 2 (jeans + shirt + blazer is fine);
    shoes within one level of the garments' average;
  - *season* — at least one season shared with every enriched piece;
  - *pattern* — at most one patterned piece (stripe/check/print/graphic);
    solid and texture combine freely.

  Level 0 = all rules; 1 = without pattern; 2 = formality only; 3 = no rules
  (the original behaviour). A slot is therefore filled whenever any candidate
  exists. Products without enrichment never rule anything out, so an
  un-enriched catalogue behaves exactly as before.
- **Swap** (`alternativesFor`) ranks alternatives the same way against the rest of the look.
- Known limitation: dresses fill the *top* slot and suits the *outerwear* slot,
  so a dress can get trousers and a suit a second pair. The user-test catalogue
  excludes both.

---

## 7. Configuration

All variables are listed with explanations in [`.env.example`](../.env.example).

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | app (Vercel) + scripts | Postgres; on Neon the *pooled* URL (`-pooler`) for the app |
| `DATABASE_URL_UNPOOLED` | scripts | Direct Neon URL, preferred by CLI scripts |
| `ADTRACTION_JOHNELLS_FEED_URL` | scripts | Feed URL with affiliate token — secret |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID`, `OPENAI_API_KEY` | scripts | Model providers — never on Vercel |
| `ENRICHMENT_PROVIDER` / `_MODEL` / `_EFFORT` | scripts | Defaults for `products:enrich*` |
| `ENRICHMENT_PRICING_JSON` | scripts | Extra/overriding model prices |
| `TEST_CATALOGUE` | app | Restrict the app to a named test catalogue (§5.4) |
| `LOG_LEVEL` | both | debug · info · warn · error |
| `ENV_FILE` | scripts | Load a different env file (e.g. `.env.neon`) |

`scripts/env.ts` loads `.env.local` (or `ENV_FILE`) for every CLI script.
`connect({ direct: true })` makes scripts prefer the direct URL;
`connectionUrl()` strips libpq-only parameters (`channel_binding`) that
postgres.js rejects.

---

## 8. Deployment topology

- **Vercel** hosts the app; functions are pinned to `fra1` in `vercel.json`, next
  to the Neon project (AWS eu-central-1, Frankfurt, Postgres 18). Change both
  together. Pushing to `master` deploys **Production**; pushing any other branch
  creates a **Preview**.
- **Neon** holds the only database. Production and all CLI work use it.
- Environment variables in Vercel today: `DATABASE_URL` (Production),
  `TEST_CATALOGUE=user-test-1` (Production, and Preview for branch `user-test-1`).
  Preview deployments have no `DATABASE_URL`, so they cannot serve products, and
  are behind Vercel Authentication.
- Product images are served from the merchant through `next/image`
  (`remotePatterns` in `next.config.ts`).

---

## 9. Testing

`npm test` runs vitest. Database tests use **PGlite** (in-process Postgres) with
the real migrations, so no database server is needed. Coverage includes
normalization and category regression cases from the real feed, import
idempotency and safeguards, every enrichment stage (schema, normalization,
rules, gate versions, pipeline, claims, pilot isolation, fail-fast, provider
adapters with fake clients), the read side (eligibility, test catalogue on every
path, enrichment summary, tags) and client logic (outfit generation,
compatibility, feed composition, state migration). Typecheck: `npx tsc --noEmit`;
lint: `npx eslint src scripts`.

# STYLEAI

A fashion discovery app: swipe through a feed shaped by your taste, save
what you love, and watch a lightweight local "style profile" sharpen with
every like and dismiss. Built from the visual/UX reference in `reference/`.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS v4 · React 19 · Framer Motion

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

Push to a Git repo and import it in [Vercel](https://vercel.com/new) — no
extra configuration needed. Product photography is served from
`images.unsplash.com` via `next/image` (configured in `next.config.ts`).

## How it works

- **State**: Styles, likes/saved items (by product id), tag affinities, feed
  position and onboarding progress live in a single React Context
  (`src/lib/store/style-profile-context.tsx`), persisted to `localStorage`.
- **Personalization**: every like/dismiss nudges a set of style-tag scores
  (`src/lib/personalization.ts`). The feed re-sorts the *upcoming* cards by
  those scores after each reaction, and the same scores drive search
  ranking, the "why we picked this" copy, and the profile's affinity list.
- **Catalog**: real products from Postgres via the product API (see
  "Backend" below). The client caches products by id
  (`src/lib/store/product-catalog.tsx`) and pages the feed in
  (`src/lib/store/use-feed.ts`).
- **Routing**: `/`, `/onboarding` (+ `upload`/`analysis`/`style`),
  `/discover`, `/search`, `/saved`, `/profile`, `/product/[id]`. Opening a
  product from within the app shows it as a sliding sheet via a Next.js
  intercepting route; direct links/refreshes render it as a full page.

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
| `GET /api/feed?cursor=&limit=` | For You feed — active, in-stock products, stable order, keyset-paginated |
| `GET /api/products?ids=a,b` | Resolve products by id (incl. unavailable — for saved items) |
| `GET /api/products?category=&gender=&exclude=&limit=` | Filter by canonical fields (Build the Look, "more like this") |
| `GET /api/products/:id` | One product (404 if unknown) |
| `GET /api/products/:id/shop` | 302 to the merchant/affiliate URL of the best offer |
| `GET /api/search?q=&limit=` | Keyword search (Postgres full-text) |
| `GET /api/inspiration` | Catalogue images for onboarding / new style |

Responses use the `Product` type in `src/lib/types.ts`; no source ids or
offer internals are exposed.


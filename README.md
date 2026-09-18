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

- **State**: all personalization (likes, dismisses, tag affinities, feed
  ranking, onboarding progress) lives in a single React Context
  (`src/lib/store/style-profile-context.tsx`) and is persisted to
  `localStorage` — there's no backend or database.
- **Personalization**: every like/dismiss nudges a set of style-tag scores
  (`src/lib/personalization.ts`). The feed re-sorts the *upcoming* cards by
  those scores after each reaction, and the same scores drive search
  ranking, the "why we picked this" copy, and the profile's affinity list.
- **Mock catalog**: `src/lib/data/products.ts` — 12 products with real
  (stock) photography, no live API.
- **Routing**: `/`, `/onboarding` (+ `upload`/`analysis`/`style`),
  `/discover`, `/search`, `/saved`, `/profile`, `/product/[id]`. Opening a
  product from within the app shows it as a sliding sheet via a Next.js
  intercepting route; direct links/refreshes render it as a full page.

# StyleAI operations

Runbooks for everything that changes data or deployments. How the parts work is
in [ARCHITECTURE.md](ARCHITECTURE.md); why, in [DECISIONS.md](DECISIONS.md).

> **Current state (October 2026): Production is running the controlled user
> test.** `TEST_CATALOGUE=user-test-1` is set in Vercel Production, so the public
> site shows only the 120 enriched test products. **Do not run catalogue imports
> while the test runs** (§7). To end it, see §7.4.

---

## 1. Ground rules

- **The database is shared.** There is one Neon database. The deployed app, every
  CLI script and every developer machine use it. Every script in this document
  changes production data unless it says *dry run* or *read-only*. It also
  holds real users' accounts and style data: signing in to a local dev server
  that points at Neon reads and writes your production account.
- **Scripts run locally**, never on Vercel. `scripts/env.ts` loads `.env.local`
  (or the file named in `ENV_FILE`); scripts prefer `DATABASE_URL_UNPOOLED`.
- **Secrets** — the feed URL (affiliate token), model API keys and database URLs —
  stay in git-ignored env files. Never commit them, paste them in tickets, or
  add model keys to Vercel. If one leaks, rotate it.
- **`master` deploys Production.** Push to master only when you intend to deploy.
- **Pilot before production.** Model, taxonomy, prompt or gate changes are
  evaluated on a pilot first; a full-catalogue backfill needs explicit approval.
- Before committing: `npx tsc --noEmit && npx eslint src scripts && npm test`.

---

## 2. Setup

```bash
npm install
cp .env.example .env.local      # fill in DATABASE_URL(_UNPOOLED), feed URL, ANTHROPIC_API_KEY,
                                # BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID/_SECRET
npm run dev                     # http://localhost:3000, against the database in .env.local
```

Every page needs a Google sign-in. The Google OAuth client must list
`http://localhost:3000/api/auth/callback/google` as a redirect URI. Sign in at
`localhost`, not the machine's LAN IP — Google refuses private-IP redirects, so
signed-in flows can't be tested from a phone against a dev server; use
Production or a desktop browser at phone width.

For a throw-away local database instead of Neon: `npm run db:up` (Docker,
Postgres on port 5433), point `DATABASE_URL` at it, then `npm run db:migrate`.

Migrations: `npm run db:generate` after a schema change, review the SQL in
`drizzle/`, then `npm run db:migrate`.

---

## 3. Catalogue import

```bash
npm run products:analyze -- --source adtraction:johnells     # dry run: mapping coverage, writes nothing
npm run products:import                                      # full sync of every source (idempotent)
npm run products:import -- --source adtraction:johnells --force   # re-import an unchanged feed / allow large shrink
npm run products:import -- --limit 500                       # subset run, never deactivates
npm run products:import -- --file feed.xml --source adtraction:johnells
```

What to check in the output: `productsCreated / Updated / Deactivated`,
`rowsInvalid`, `productsFailed`. A run that skips deactivation with "feed much
smaller than current catalog" means the feed looked broken — investigate before
using `--force`.

Effects on enrichment: an import that changes a product's content (text,
images, category, colours, **or its category paths, including campaign trees**)
makes its enrichment stale: it disappears from recommendation-ready and from
the test catalogue until it is re-enriched. Price and stock changes do not.

### 3.1 Changing category rules safely

Category rules (`src/server/catalog/mapping/dictionaries.ts`,
`normalize.ts`) affect the whole catalogue. Never fix one product by name.

1. Find the cause: print the product's raw title, category paths and
   description from the feed, and run `resolveCategory` on them.
2. Make the smallest general rule change, and add regression cases to
   `src/server/catalog/__tests__/pipeline.test.ts` — both the products that
   must change and similar products that must not.
3. **Before applying, diff the whole catalogue**: snapshot the feed once,
   normalize + group it with the old rules and with the new rules, compare
   category/subcategory per product, and confirm the old rules reproduce what is
   stored in the database. Review every changed product. (This was done with
   scratch scripts; there is no committed diff command yet.)
4. Check the new tests fail on the old rules and pass on the new ones.
5. Apply with a normal `npm run products:import`, then confirm the database
   matches the new rules.

---

## 4. Enrichment

All commands take `--provider anthropic|openai --model <id> [--effort low|medium|high]`
(or `ENRICHMENT_PROVIDER/_MODEL/_EFFORT`). The validated configuration is
**`--provider anthropic --model claude-opus-5-5 --effort low`**, about
**$0.032–0.034 per product**.

### 4.1 Status

```bash
npm run products:enrich-report               # read-only: candidates by status, recommendation-ready, recent runs
npm run products:enrich-report -- --run 8    # one run: stats, review/failure reasons, warnings, problem products
```

### 4.2 Pilots (evaluation, never touch production state)

```bash
# Seeded, stratified sample (~37 products; --size N scales it)
npm run products:enrich-pilot -- --seed 123 --dry-run
npm run products:enrich-pilot -- --seed 123 --provider anthropic --model claude-opus-5-5 --effort low

# Same products as an earlier run (refuses if their content changed, unless --allow-changed)
npm run products:enrich-pilot -- --from-run 4 --provider anthropic --model claude-sonnet-5-5 --effort low

# Held-out sample: excludes products of earlier runs and their same-style siblings
npm run products:enrich-pilot -- --seed <new> --size 46 --exclude-run 3 --exclude-run 4 ... --provider ... --model ...
```

Pilots send images inline (byte-identical, SHA-256-fingerprinted) so models get
identical input.

### 4.3 Reviewing results

```bash
npm run products:enrich-report -- --run 4 --run 5 --html --csv      # side-by-side review sheet + CSV in .data/enrichment/
npm run products:enrich-report -- --run 4 --run 5 --attention        # only what needs a human; export decisions as CSV
npm run products:enrich-report -- --run 4 --run 6 --compare \
  --decisions .data/enrichment/attention-decisions-4-5.csv --decision-runs 4,5   # before/after report
npm run products:enrich-report -- --eval reviewed.csv                # accuracy + confidence calibration from a marked CSV
```

The attention report is an HTML page: mark each item, use **Export CSV**, and
keep the file in `.data/enrichment/` (git-ignored). The comparison report
replays both runs under every gate version, which separates "the gate got more
lenient" from "the predictions got better".

### 4.4 Production enrichment

```bash
npm run products:enrich -- --provider anthropic --model claude-opus-5-5 --effort low --image-mode inline --limit 50
npm run products:enrich -- ... --ids <uuid> --ids <uuid>       # exact products (re-enriches them even if current)
npm run products:enrich -- ... --retry-failed --limit 100      # also failed products with < 3 attempts
npm run products:enrich -- ... --include-review --limit 100    # also needs_review products
npm run products:enrich -- ... --limit 5 --dry-run             # selection + first prompt, no model calls
```

Without `--ids`, only **pending** products are selected (new, changed, or on an
older taxonomy/prompt). Completed results whose content and versions are
current are never re-processed.

### 4.5 Full-catalogue backfill (needs approval; not run yet)

About 1,750 candidates × $0.034 ≈ **$60**, about 40 minutes. Run it in batches of
150 so each batch finishes well inside the 15-minute claim window:

```bash
while true; do
  npm run -s products:enrich -- --provider anthropic --model claude-opus-5-5 --effort low \
    --kind backfill --image-mode inline --limit 150 2>&1 | tee -a .data/enrichment/backfill.log
  status=${PIPESTATUS[0]}
  [ "$status" -ne 0 ] && break
  tail -n 40 .data/enrichment/backfill.log | grep -q "^0 product(s) selected" && break
done
```

- **Monitor**: `tail -f .data/enrichment/backfill.log` (a "done N of M" line per
  product) and `npm run products:enrich-report` in another terminal.
- **Resume**: run the same loop again; finished products are skipped. After a
  crash or Ctrl-C, the interrupted batch's claims expire after 15 minutes — wait
  that long, or those products are skipped until a later batch. Never run two
  loops at once.
- **Expect** ~3–7% needs_review (mostly catalogue errors the model flags) and
  ~1% failed (oversized images). Neither replaces anything; handle them with
  §4.6. A misconfiguration (bad key, unknown model) stops the run after 3
  rejected requests.
- Each completed result is active immediately.

### 4.6 needs_review and failed products

There is no review UI. List them with `npm run products:enrich-report -- --run <id>`.

- **Catalogue error** (category_disagrees / category_mismatch): fix the rule (§3.1)
  and re-import; the content change makes the product pending again; then
  `products:enrich --limit …` re-enriches it.
- **Low confidence on a required field**: look at the image. Re-running rarely
  helps; there is currently no way to accept a result manually.
- **`image_error: image too large`**: the image exceeds our 5 MB inline cap.
  `--image-mode url --ids <id>` lets the provider fetch it instead (untested for
  these sizes — providers have their own limits); otherwise the image needs
  downscaling before sending, which is not implemented yet.
- Provider errors: `--retry-failed`.

### 4.7 Taxonomy, prompt or gate changes

1. Change `taxonomy.ts` / `prompt.ts` / `gate.ts`; bump `TAXONOMY_VERSION`,
   `PROMPT_VERSION` or `GATE_VERSION` with a changelog line in the file.
   Additive changes are a minor bump; removing or renaming a value is a major one.
2. Add tests (taxonomy, validator, gate replay in `applyGateAs`).
3. Re-run a pilot on the same products (`--from-run`) and compare (`--compare`).
4. Validate on a held-out sample (`--exclude-run`) before trusting the result.
5. A taxonomy/prompt bump marks every product pending; production then needs a
   (budgeted) re-enrichment. A gate-only change does not.

---

## 5. Deployments

- `master` → Vercel Production (https://fashionista-app-three.vercel.app).
  Any other branch → a Preview (behind Vercel Authentication; no `DATABASE_URL`
  or auth settings, so it cannot sign anyone in or serve products until those
  are added for Preview — plus the Preview URL as a redirect URI in Google).
- Production needs `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and
  `GOOGLE_CLIENT_ID` / `_SECRET` (README → Deploy). Changing
  `BETTER_AUTH_SECRET` signs everyone out.
- A schema change: run `ENV_FILE=.env.neon npm run db:migrate` *before* pushing
  code that needs it, and keep migrations additive while code that doesn't
  know them may still be running.
- Environment variables: Vercel → Project → Settings → Environment Variables, or
  `npx vercel env ls | add | rm` (log in with `npx vercel login`, link with
  `npx vercel link --project fashionista-app`). A change only applies to new
  deployments — redeploy after changing one.
- Roll back a deploy: Vercel → Deployments → a previous Production deployment →
  Promote / Redeploy.

---

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Every page redirects to `/login`; API calls return 401 | No valid session — sign in. Curl needs the session cookie (§7.2) |
| Google sign-in fails with `redirect_uri_mismatch` | The origin isn't a redirect URI on the OAuth client, or `BETTER_AUTH_URL` doesn't match the URL you're on (e.g. a LAN IP) |
| A style's feed shows "You've seen every product/outfit" | That style has swiped everything it can be shown: products it has liked/disliked (`product_reactions`) and outfit anchors it has swiped (`seen_outfit_anchors`) are left out. Another style, or more products, will show more |
| Enrichment: 400 "API key not scoped to a workspace" | Use a workspace key (`sk-ant-api03-…`) or set `ANTHROPIC_WORKSPACE_ID` |
| `image_error: image too large` | Image over the 5 MB inline cap — §4.6 |
| Import says "feed unchanged — skipping" | Feed not modified since the last run; `--force` to re-import anyway |
| Import skips deactivation | Feed < 50% of the active catalogue — likely a broken feed |
| A product vanished from the test catalogue | Its content changed (often a campaign path) — re-enrich it (§7.3) |
| Neon connection error about `channel_binding` | Use `connectionUrl()` (scripts do); don't pass libpq-only params to postgres.js |

---

## 7. User test (`user-test-1`)

### 7.1 What is running

- Catalogue: `src/server/products/test-catalogues/user-test-1.json` — 125 approved
  products (64 men, 61 women) across top / bottom / outerwear / footwear. 120 are
  enriched and visible (enrichment run #8); 5 are excluded (4 needs_review, 1 failed).
- Production has `TEST_CATALOGUE=user-test-1`; the code is on `master` and on branch `user-test-1`.

### 7.2 Verify (read-only)

The API needs a session. Sign in on the site, then copy the value of the
`__Secure-better-auth.session_token` cookie (browser devtools → Application →
Cookies). Treat it like a password; signing out invalidates it.

```bash
U=https://fashionista-app-three.vercel.app
C="Cookie: __Secure-better-auth.session_token=<value>"
curl -s -H "$C" "$U/api/feed?for=outfits&gender=men&limit=50" | jq '.products | length'      # ≤ 62
curl -s -H "$C" "$U/api/products?category=shoes&gender=women&limit=50" | jq '.products | length'
curl -s -H "$C" -o /dev/null -w '%{http_code}\n' "$U/api/products/<id outside the list>"     # 404
curl -s -o /dev/null -w '%{http_code}\n' "$U/api/feed"                                       # 401 without a session
npm run products:enrich-report                                                               # recommendation-ready count
```

Last verified after deployment: every feed, search, product and outfit page
works; 120 distinct products, 0 outside the list, 0 without enrichment; every
anchor produces a complete 4-piece outfit for both genders; every slot has swap
alternatives.

### 7.3 Change the test catalogue

1. Edit the JSON (ids only matter; keep brand/name/cohort/role for review).
2. Enrich only the new ids:
   ```bash
   npm run products:enrich -- --provider anthropic --model claude-opus-5-5 --effort low \
     --image-mode inline --kind incremental --ids <uuid> [--ids <uuid> …]
   ```
3. Commit, push to `master` (deploys), verify (§7.2).

To re-enrich the whole test catalogue (~$4):
`--ids` generated from the file:
`$(node -e 'for (const p of require("./src/server/products/test-catalogues/user-test-1.json").products) console.log("--ids", p.id)')`.

### 7.4 End the test / roll back

```bash
npx vercel env rm TEST_CATALOGUE production
```

Then redeploy the current Production deployment (Vercel → Deployments →
Redeploy). The full catalogue returns; enriched products keep their enrichment
summary and enrichment-based tags, the rest behave as before.

### 7.5 During the test

- Do **not** run `products:import` — content changes make enriched products stale
  and they drop out of the catalogue.
- Do not run enrichment with `--include-review`/`--retry-failed` broadly; change
  the catalogue deliberately (§7.3).
- Testers sign in with Google. Their styles, likes/dislikes per style and saved
  outfits are stored per user (`style_profiles`, `product_reactions`,
  `saved_outfits`, `seen_outfit_anchors`, `user_preferences`).
  There is no analytics or event log (no swipe timestamps or order beyond
  `created_at`/`updated_at`), and no in-app feedback — gather feedback outside
  the app.

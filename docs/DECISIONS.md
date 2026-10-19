# StyleAI decisions

Why the system is the way it is, with the evidence behind each decision, plus
the run history and the open issues. Newest decisions last. How things work:
[ARCHITECTURE.md](ARCHITECTURE.md). Commands: [OPERATIONS.md](OPERATIONS.md).

Review artefacts referred to below (review sheets, attention reports, decision
CSVs, comparison reports, run manifests) are in `.data/enrichment/`, which is
git-ignored — they exist only on the machine that produced them.

---

## Enrichment run history

| Run | Kind | Model (effort) | Taxonomy / prompt / gate | Products | Completed / review / failed | Cost |
|---|---|---|---|---|---|---|
| 3 | pilot | Opus 5.5 (low) | 1.0 / 1.0 / 1.0 | 37 | 0 / 0 / 37 — key not scoped to a workspace | $0 |
| 4 | pilot | Opus 5.5 (low) | 1.0 / 1.0 / 1.0 | 37 | 26 / 11 / 0 | $1.2196 |
| 5 | pilot | Sonnet 5.5 (low) | 1.0 / 1.0 / 1.0 | 37 (same as 4) | 19 / 18 / 0 | $0.6361 |
| 6 | pilot | Opus 5.5 (low) | 1.1 / 1.1 / 1.1 | 37 (same as 4) | 31 / 6 / 0 | $1.2663 |
| 7 | pilot | Opus 5.5 (low) | 1.2 / 1.2 / 1.2 | 45 held-out (seed 63771) | 42 / 3 / 0 | $1.5214 |
| 8 | incremental (production) | Opus 5.5 (low) | 1.2 / 1.2 / 1.2 | 125 (`user-test-1`) | 120 / 4 / 1 | $3.9761 |

Total model spend to date ≈ **$8.62**. Prices verified on 2026-10-07 (`pricing.ts`).

---

## D1. Enrichment is a separate, versioned interpretation layer

**Decision.** AI output is stored next to the catalogue (`product_enrichments`,
`product_enrichment_state`), never written into products. Every attempt is
appended; taxonomy, prompt and gate are versioned and recorded on each result.

**Why.** Source facts and normalized categories must stay trustworthy and
reproducible from the feed; AI results must be comparable across models and
versions and attributable to what produced them.

## D2. Provider-neutral, merchant-neutral pipeline

**Decision.** A `ModelProvider` interface (Anthropic and OpenAI adapters), a
provider-neutral input built from canonical columns only, and no merchant names
in the enrichment code.

**Why.** Model choice should be an evaluation result, not an architecture
commitment; adding merchants must not touch enrichment.

## D3. Pilot runs can never change production state

**Decision.** Activation depends only on the run kind (`pilot` never activates),
not on a caller flag. Pilots send byte-identical inline images and record their
SHA-256; reports check that compared runs had identical input.

**Why.** Model comparisons must be fair and must not leak into what users see.

## D4. Refusal fallbacks are off

**Decision.** Anthropic's server-side fallback to another model is not enabled; a
refusal is recorded as a failed attempt.

**Why.** A silent fallback answers with a different model, corrupting comparisons and cost attribution.

## D5. Opus 5.5 at low effort is the enrichment model

**Evidence (runs 4 vs 5, 37 products, human review of 41 items).** The models
agreed on formality 37/37, fit 36/37, primary colour 35/37, garment type 34/37.
Of 24 real disagreements the reviewer judged Opus right 7, Sonnet right 3,
neither 3, both acceptable 11. Opus completed 26/37 vs Sonnet 19/37. Cost per
product $0.033 vs $0.017.

**Decision.** Opus 5.5, effort low. The sample is small: read it as "Opus is at
least as good", at roughly twice the cost (≈ $60 vs $30 for the full catalogue).

## D6. Gate 1.1 — low-confidence fit does not block

**Evidence.** All 12 low-confidence fit values the reviewer checked were correct;
fit is hard to see on packshots. Replaying run 4 under the new gate: 26 → 31 completed.

**Decision.** Low-confidence fit becomes a stored note; its confidence remains
available for ranking. Every other blocking rule unchanged.

## D7. Taxonomy and prompt 1.1

**Evidence (review of runs 4/5).** `classic` was on 26/37 products (70%) — used as
a generic label; colour_profile was the weakest field (2 of its disagreements
"neither"); check vs texture confused on suiting; missing leg shape (bootcut,
flare, wide) and shearling.

**Decision.** Define every aesthetic (`classic` = long-established archetype);
pattern rules judged at outfit distance; colour profiles constrained by colour
family (kept, because they carry what canonical colours cannot — how light a
grey is, how saturated a blue is); add `leg_shape` and `shearling`. Additive,
so a minor version.

**Result (run 6 vs 4, same products).** `classic` 26 → 12, colour-family
violations 3 → 0, texture 5 → 2, 29 of 40 human decisions matched. The review
rate fell 11 → 6, but the replay showed that came from the gate and three
catalogue/input fixes, offset by three new reviews — not from better predictions.

## D8. Gate 1.2 — all-low aesthetics do not block

**Evidence.** The stricter 1.1 definitions made the model honest about weak style
signals; the validator then dropped its only (low-confidence) label, leaving
aesthetics empty and blocking the product. For one product the dropped label
was the one the reviewer had chosen.

**Decision.** When every aesthetic is low-confidence, keep the best one with its
confidence and record a note. An empty list still blocks.

## D9. Taxonomy and prompt 1.2 — denim is blue

**Evidence.** The 1.1 wording ("dark indigo denim → neutral_dark") pushed dark
denim to the hue `navy`, which the reviewer rejected.

**Decision.** Hue and profile are separate decisions: indigo denim is `blue` at any
wash, darkness goes in the profile; navy is a dyed dark blue. A non-blocking
`denim_navy` warning makes regressions measurable. Verified only lightly (run 7
had one indigo item, correct; a dyed navy puffer stayed navy).

## D10. Catalogue: construction and feature words are hints

**Decisions and full-catalogue diffs (each reviewed before applying):**

- `boot` in a title is a hint — "Kara Boot" jeans were shoes (1 product changed).
- `pullover` in a title is a hint; a `Half-Zip` category path stands unless the
  description names another specific garment (3 changed: a Lauren "Knit
  Pullover" top, a cotton Hartsfield half-zip sweatshirt, a "Knit Pullover
  Sweatshirt" hoodie).
- a bare `hood` in a title is a hint, and the description's repetition of the
  product name is not evidence; gloves/mittens and jewellery are accessories
  (15 changed: 10 down/fleece jackets out of sweatshirts, a mitten, 3 brooches,
  a glove subcategory).

**Why.** Merchant titles carry style and model names; a general rule plus
regression tests beats per-product exceptions. Fleece jackets are kept in
outerwear (a deliberate call).

## D11. Validate on held-out products before trusting a change

**Evidence (run 7, 45 products excluded from tuning, including same-style
siblings).** 42 / 3 / 0; the 3 reviews were all genuine catalogue errors (a
mitten, a brooch, a down jacket filed as a sweatshirt). `classic` on 29%. Of the
42 completions, 12 depended on the relaxed gates (9 fit, 3 aesthetics); a visual
check found all fit labels plausible and one questionable aesthetic.

**Decision.** The 1.1/1.2 improvements generalize; the configuration is good
enough for a user test.

## D12. User test before full backfill

**Decision.** Test with real users on a small, curated catalogue before spending
≈ $60 on the full catalogue.

**Catalogue `user-test-1`.** 125 products (64 men, 61 women), seeded selection
across top / bottom / outerwear / footwear with quotas per category, spread over
subcategories and price quartiles, brand caps (2 per category, 4 per gender), in
stock with ≥ 2 sizes. **Excluded**: jewellery, accessories, bags, underwear
(no outfit slot); dresses and suits (the slot model would pair a dress with
trousers, a suit with a second pair); waistcoats; shorts and sandals (October).
All 125 were enriched in one production run (#8) rather than promoting the 30
valid pilot results, so the test catalogue comes from one run on one version.

**Result.** 120 recommendation-ready (men 24/14/14/10, women 21/15/12/10 for
top/bottom/outerwear/footwear). The 5 excluded are 3 catalogue errors (a denim
shirt filed as jeans, a knitted cardigan as outerwear, a ribbed top as
knitwear), a sneaker with a low-confidence pattern, and one oversized image.

## D13. Test catalogue restriction design

**Decision.** `TEST_CATALOGUE=<name>` names a committed JSON list; queries require
list membership **and** a current completed enrichment; enforced in the product
service for every path except the shop redirect; off by default; an unknown
name fails closed.

**Why.** A committed list is reviewable and versioned; requiring enrichment
means nothing un-described can appear; enforcing in the backend means no UI
path can leak.

## D14. Outfit compatibility ranks, it does not filter

**Decision.** Candidates are ranked by compatibility (formality, season, pattern;
relaxed in that order: pattern, then season, then formality) before style affinity.
Products without enrichment never rule anything out.

**Why.** Hard filters can empty a slot in a small catalogue; ranking guarantees a
complete look whenever any candidate exists and reproduces the old behaviour
without enrichment.

**Result (production, test catalogue).** Every anchor produces a complete 4-piece
outfit (men 62/62, women 58/58). In the Outfits feed 4–6% of picks are
fallbacks (the feed's variety hold-back narrows choices); on the Build-outfit
path 99–100% are fully compatible.

## D15. Run the user test in Production

**Context.** Preview deployments had no `DATABASE_URL` and sit behind Vercel
Authentication; there is only one database anyway, so a preview gives no data
isolation.

**Decision.** Set `TEST_CATALOGUE=user-test-1` in Production and fast-forward
`master` to the tested branch. Trade-off: the whole public site shows only the
test catalogue while the flag is on, and there is no staging step before
testers see a change. Rollback: remove the variable and redeploy.

---

## Known issues and open items

| # | Issue | Impact | Suggested fix |
|---|---|---|---|
| 1 | `content_hash` includes category paths, which include campaign trees | A product added to a campaign looks changed: its enrichment goes stale and it drops out of the test catalogue / recommendation-ready | Hash only identity-relevant paths (exclude the source's ignored campaign trees) |
| 2 | Inline images over 5 MB fail (`image_error`) | ~1% of products | Downscale before sending |
| 3 | Remaining category errors: "denim" in a shirt's title → jeans; "Jacket" in a knit's name → outerwear; ribbed knit tops → knitwear; Peak Performance "Helium down hybrid hood" → sweatshirts | Products in wrong slots / needs_review | Rule fixes via the diff process (OPERATIONS §3.1) |
| 4 | Dresses fill the top slot, suits the outerwear slot | Dress + trousers, suit + trousers | Dress = top + bottom; suit = outerwear + bottom |
| 5 | `outfitAffinity` is learned but unused; the Products feed isn't personalized (picked favourites only seed a style's taste) | Personalization is shallow | Recommendation milestone |
| 6 | No review UI and no way to accept a needs_review result | Manual work happens in scripts | Small admin/review tool |
| 7 | No committed catalogue-diff command | Rule changes need scratch scripts | Add `products:category-diff` |
| 8 | Men's sneakers: 2 of 10 shoes in `user-test-1` | Casual men's looks repeat sneakers | Swap in one more sneaker (~$0.03) |
| 9 | Search covers clothing only | Searching for shoes returns nothing | Include shoes in search if wanted |
| 10 | `wide_trousers` overlaps `leg_shape: wide` | Two ways to say the same thing | Remove in taxonomy 2.0 |
| 11 | Preview deployments have no `DATABASE_URL` and need Vercel login | Previews can't be used for testing | Add a Preview `DATABASE_URL` (or a separate Neon branch) and adjust deployment protection |
| 12 | Model/review history lives in git-ignored `.data/` | Evidence can be lost | Archive key reports with the docs if needed |
| 13 | Feed data quality: e.g. Parajumpers "Nolan" has a children's description | Minor | Report to the merchant |

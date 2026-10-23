/**
 * Product read service: database rows → the frontend `Product` DTO.
 * Route handlers and server components call these; nothing outside this
 * module needs to know about offers, variants or source rows.
 */

import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { sizeRank } from "@/server/catalog/grouping";
import type { Category, Gender, ProductType } from "@/server/catalog/types";
import type { Db } from "@/server/db/client";
import { offers, productReactions, products, seenOutfitAnchors, variants } from "@/server/db/schema";
import type { Product } from "@/lib/types";
import { eligibleFor, type FeedKind, type ShopperGender } from "./eligibility";
import { activeEnrichmentColumn, parseActiveEnrichment } from "./enrichment";
import { deriveTags } from "./tags";
import { testCatalogueScope } from "./test-catalogue";

export const MAX_LIMIT = 50;

// Correlated subqueries reference "products"."id" explicitly: Drizzle renders
// columns unqualified in a select list, which is ambiguous inside a subquery.

/** Active offers first, cheapest first — the offer a shopper is sent to. */
const bestOffer = (column: "merchant" | "url") => sql<string | null>`(
  select o.${sql.raw(column)} from ${offers} o
  where o.product_id = "products"."id"
  order by (o.status = 'active') desc, coalesce(o.sale_price_minor, o.price_minor) asc nulls last
  limit 1
)`;

const activeSizes = sql<string[]>`coalesce((
  select array_agg(distinct v.size) from ${variants} v
  join ${offers} o on o.id = v.offer_id
  where o.product_id = "products"."id" and o.status = 'active'
    and v.status = 'active' and v.size is not null
), '{}')`;

const columns = {
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
  status: products.status,
  isAvailable: products.isAvailable,
  priceMinor: products.priceMinor,
  salePriceMinor: products.salePriceMinor,
  currency: products.currency,
  merchant: bestOffer("merchant"),
  sizes: activeSizes,
  enrichment: activeEnrichmentColumn,
};

const selectProducts = (db: Db) => db.select(columns).from(products);
type Row = Awaited<ReturnType<typeof selectProducts>>[number];

/** Only products that can actually be shown: active, in stock, with an image. */
const showable = and(
  eq(products.status, "active"),
  eq(products.isAvailable, true),
  sql`cardinality(${products.images}) > 0`,
);

// Every product query below adds testCatalogueScope(): a no-op unless
// TEST_CATALOGUE restricts the app to an approved test catalogue. It is
// evaluated per query, so the restriction can never be cached in or out.

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function toProductDto(row: Row): Product {
  const minor = row.salePriceMinor ?? row.priceMinor ?? 0;
  const enrichment = parseActiveEnrichment(row.enrichment);
  return {
    id: row.id,
    brand: row.brand ?? "",
    name: row.name,
    price: minor / 100,
    currency: row.currency ?? "SEK",
    image: row.images[0] ?? "",
    images: row.images,
    productType: row.productType as ProductType,
    category: row.category as Category,
    subcategory: row.subcategory ?? undefined,
    gender: (row.gender as Gender | null) ?? undefined,
    color: row.colors[0] ? capitalize(row.colors[0].replace("-", " ")) : row.sourceAttributes.colorsRaw[0],
    colors: row.colors as Product["colors"],
    material: row.sourceAttributes.material,
    retailer: row.merchant ?? "",
    sizes: [...row.sizes].sort((a, b) => sizeRank(a) - sizeRank(b)),
    available: row.status === "active" && row.isAvailable,
    shopUrl: `/api/products/${row.id}/shop`,
    tags: deriveTags(row, enrichment),
    ...(enrichment ? { enrichment: enrichment.summary } : {}),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isProductId = (id: string) => UUID.test(id);

// ---------------------------------------------------------------------------

export interface FeedPage {
  products: Product[];
  /** Pass back as `cursor` for the next page; null when the catalogue is exhausted. */
  nextCursor: string | null;
}

/**
 * Leaves out what the style has already been shown: in the Products feed,
 * anything it has liked or disliked (every swipe is one, and so is a like
 * from a product page); in the Outfits feed, anchors of outfits it swiped.
 */
function notSeenBy(styleProfileId: string, kind: FeedKind) {
  return kind === "products"
    ? sql`not exists (
        select 1 from ${productReactions} r
        where r.style_profile_id = ${styleProfileId} and r.product_id = "products"."id"
      )`
    : sql`not exists (
        select 1 from ${seenOutfitAnchors} s
        where s.style_profile_id = ${styleProfileId} and s.product_id = "products"."id"
      )`;
}

/**
 * A feed page: showable products eligible for the feed kind and shopper gender,
 * in a stable, brand-mixed order (md5 of the id), keyset-paginated. With a
 * style, only what that style hasn't been shown yet (see notSeenBy), so a
 * reload or another device carries on rather than starting over.
 * Not personalized — that's a later milestone.
 */
export async function getFeedPage(
  db: Db,
  opts: { cursor?: string; limit: number; kind?: FeedKind; gender?: ShopperGender; styleProfileId?: string },
): Promise<FeedPage> {
  const kind = opts.kind ?? "products";
  const after = opts.cursor
    ? sql`(md5(${products.id}::text), ${products.id}) > (md5(${opts.cursor}::text), ${opts.cursor}::uuid)`
    : undefined;
  const rows = await selectProducts(db)
    .where(
      and(
        showable,
        eligibleFor(kind, opts.gender),
        testCatalogueScope(),
        opts.styleProfileId ? notSeenBy(opts.styleProfileId, kind) : undefined,
        after,
      ),
    )
    .orderBy(sql`md5(${products.id}::text)`, products.id)
    .limit(opts.limit + 1);
  const page = rows.slice(0, opts.limit);
  return {
    products: page.map(toProductDto),
    nextCursor: rows.length > opts.limit ? page[page.length - 1].id : null,
  };
}

/**
 * Any products by id, including inactive/sold-out ones (saved items must still
 * resolve). In test-catalogue mode, ids outside the catalogue resolve as not
 * found, so no page can show or build an outfit around them.
 */
export async function getProductsByIds(db: Db, ids: string[]): Promise<Product[]> {
  const valid = [...new Set(ids.filter(isProductId))];
  if (!valid.length) return [];
  const rows = await selectProducts(db).where(and(inArray(products.id, valid), testCatalogueScope()));
  const byId = new Map(rows.map((r) => [r.id, toProductDto(r)]));
  return valid.flatMap((id) => byId.get(id) ?? []);
}

export async function getProduct(db: Db, id: string): Promise<Product | null> {
  const [product] = await getProductsByIds(db, [id]);
  return product ?? null;
}

/**
 * Outfit components (Build outfit, Swap, Outfits feed candidates) and
 * "more like this": showable products eligible for outfits — clothing or
 * shoes, gender-compatible — optionally narrowed to categories. Same stable
 * order and keyset cursor as the feed, so callers can page past `limit`.
 */
export async function listProductsPage(
  db: Db,
  opts: { categories?: Category[]; gender?: ShopperGender; excludeIds?: string[]; cursor?: string; limit: number },
): Promise<FeedPage> {
  const exclude = opts.excludeIds?.filter(isProductId) ?? [];
  const after =
    opts.cursor && isProductId(opts.cursor)
      ? sql`(md5(${products.id}::text), ${products.id}) > (md5(${opts.cursor}::text), ${opts.cursor}::uuid)`
      : undefined;
  const rows = await selectProducts(db)
    .where(
      and(
        showable,
        eligibleFor("outfits", opts.gender),
        testCatalogueScope(),
        opts.categories?.length ? inArray(products.category, opts.categories) : undefined,
        ...exclude.map((id) => ne(products.id, id)),
        after,
      ),
    )
    .orderBy(sql`md5(${products.id}::text)`, products.id)
    .limit(opts.limit + 1);
  const page = rows.slice(0, opts.limit);
  return {
    products: page.map(toProductDto),
    nextCursor: rows.length > opts.limit ? page[page.length - 1].id : null,
  };
}

export async function listProducts(
  db: Db,
  opts: { categories?: Category[]; gender?: ShopperGender; excludeIds?: string[]; limit: number },
): Promise<Product[]> {
  return (await listProductsPage(db, opts)).products;
}

/** Lower-cased word tokens safe to put in a tsquery (letters/digits only). */
export function searchTokens(query: string): string[] {
  return (query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => t.length > 1).slice(0, 8);
}

/**
 * Keyword search over name, brand, canonical category/colour and description.
 * Terms are OR-ed with prefix matching and ranked, so "beige linen shirt"
 * surfaces products matching most terms first rather than returning nothing.
 */
export async function searchProducts(
  db: Db,
  query: string,
  opts: { limit: number; gender?: ShopperGender },
): Promise<Product[]> {
  const tokens = searchTokens(query);
  if (!tokens.length) return [];
  const tsquery = sql`to_tsquery('simple', ${tokens.map((t) => `${t}:*`).join(" | ")})`;
  const rows = await selectProducts(db)
    // Same eligibility as the Products feed.
    .where(and(showable, eligibleFor("products", opts.gender), testCatalogueScope(), sql`${products.searchVector} @@ ${tsquery}`))
    .orderBy(sql`ts_rank(${products.searchVector}, ${tsquery}) desc`, products.id)
    .limit(opts.limit);
  return rows.map(toProductDto);
}

/** The merchant URL a shopper should be sent to, or null if the product doesn't exist. */
export async function getShopUrl(db: Db, id: string): Promise<string | null> {
  if (!isProductId(id)) return null;
  const [row] = await db
    .select({ url: bestOffer("url") })
    .from(products)
    .where(eq(products.id, id));
  return row?.url ?? null;
}

/** Labelled inspiration images for onboarding / new-style creation, from the real catalogue. */
export const INSPIRATION_QUERIES: { label: string; query: string }[] = [
  { label: "Knit", query: "knitwear" },
  { label: "Trousers", query: "trousers wool" },
  { label: "Shirt", query: "oxford shirt" },
  { label: "Overcoat", query: "coat" },
  { label: "Wool", query: "wool ull" },
  { label: "Tailoring", query: "blazer" },
  { label: "Linen", query: "linen shirt" },
  { label: "Leather", query: "leather läder" },
  { label: "Camel", query: "camel beige" },
];

export async function getInspiration(
  db: Db,
  gender?: ShopperGender,
): Promise<{ label: string; product: Product }[]> {
  const used = new Set<string>();
  const tiles: { label: string; product: Product }[] = [];
  for (const { label, query } of INSPIRATION_QUERIES) {
    const hit = (await searchProducts(db, query, { limit: 10, gender })).find((p) => !used.has(p.id));
    if (!hit) continue;
    used.add(hit.id);
    tiles.push({ label, product: hit });
  }
  return tiles;
}

import { z } from "zod";
import { CATEGORIES } from "@/server/catalog/types";
import { getDb } from "@/server/db/client";
import { jsonError, limitParam, listParam, parseQuery, withErrors } from "@/server/http";
import { SHOPPER_GENDERS } from "@/server/products/eligibility";
import { getProductsByIds, listProducts, MAX_LIMIT } from "@/server/products/service";

const query = z.object({
  /** Fetch specific products (any status — used to resolve saved items). */
  ids: listParam.pipe(z.array(z.string()).max(MAX_LIMIT)).optional(),
  /** Or list showable products filtered by canonical fields. */
  category: listParam.pipe(z.array(z.enum(CATEGORIES))).optional(),
  gender: z.enum(SHOPPER_GENDERS).optional(),
  exclude: listParam.pipe(z.array(z.string()).max(MAX_LIMIT)).optional(),
  limit: limitParam(20, MAX_LIMIT),
});

/**
 * GET /api/products?ids=a,b,c
 * GET /api/products?category=trousers,jeans&gender=men&exclude=<id>&limit=12
 */
export const GET = withErrors("products", async (request: Request) => {
  const parsed = parseQuery(request, query);
  if (!parsed.ok) return parsed.response;
  const { ids, category, gender, exclude, limit } = parsed.data;
  const db = getDb();

  if (ids) {
    if (category || gender || exclude) return jsonError(400, "ids_cannot_be_combined_with_filters");
    return Response.json({ products: await getProductsByIds(db, ids) });
  }
  const products = await listProducts(db, { categories: category, gender, excludeIds: exclude, limit });
  return Response.json({ products });
});

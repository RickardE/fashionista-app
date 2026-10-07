import { getDb } from "@/server/db/client";
import { jsonError, withErrors } from "@/server/http";
import { getProduct } from "@/server/products/service";

/** GET /api/products/:id — one product, including unavailable ones (flagged `available: false`). */
export const GET = withErrors(
  "product",
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const product = await getProduct(getDb(), id);
    if (!product) return jsonError(404, "product_not_found");
    return Response.json({ product });
  },
);

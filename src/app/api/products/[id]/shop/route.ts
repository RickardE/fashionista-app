import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { jsonError, withErrors } from "@/server/http";
import { getShopUrl } from "@/server/products/service";

/**
 * GET /api/products/:id/shop — redirects to the merchant (affiliate) URL of the
 * product's best offer. The frontend never handles merchant URLs, and this is
 * where shop-click tracking will hook in. Only URLs from our own catalogue are
 * ever redirected to (no open redirect).
 */
export const GET = withErrors(
  "product-shop",
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const auth = await requireUser(request);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const url = await getShopUrl(getDb(), id);
    if (!url) return jsonError(404, "product_not_found");
    return Response.redirect(url, 302);
  },
);

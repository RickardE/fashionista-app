import { notFound } from "next/navigation";
import { getDb } from "@/server/db/client";
import { getProduct } from "@/server/products/service";
import { ProductPageClient } from "./page-client";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProduct(getDb(), id);
  if (!product) notFound();

  return <ProductPageClient product={product} />;
}

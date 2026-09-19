import { notFound } from "next/navigation";
import { PRODUCTS, PRODUCTS_BY_ID } from "@/lib/data/products";
import { OutfitPageClient } from "./page-client";

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ id: p.id }));
}

export default async function OutfitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!PRODUCTS_BY_ID[id]) notFound();

  return <OutfitPageClient key={id} anchorId={id} />;
}

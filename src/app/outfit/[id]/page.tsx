import { notFound } from "next/navigation";
import { parseOutfitItems } from "@/lib/outfits";
import { getDb } from "@/server/db/client";
import { getProduct } from "@/server/products/service";
import { OutfitPageClient } from "./page-client";

export default async function OutfitPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ items?: string }>;
}) {
  const { id } = await params;
  const { items } = await searchParams;
  const anchor = await getProduct(getDb(), id);
  if (!anchor) notFound();
  const initialItems = parseOutfitItems(items);

  return <OutfitPageClient key={`${id}:${items ?? ""}`} anchor={anchor} initialItems={initialItems} />;
}

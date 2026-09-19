import Link from "next/link";
import { OutfitComposition } from "@/components/OutfitComposition";
import { formatPrice } from "@/lib/format";
import { outfitItemList, outfitTotal } from "@/lib/outfits";
import type { Outfit } from "@/lib/types";

export function LookTile({ outfit }: { outfit: Outfit }) {
  const list = outfitItemList(outfit.items);
  const total = outfitTotal(outfit.items);

  return (
    <Link href={`/outfit/${outfit.anchorId}`} className="block">
      <OutfitComposition products={list.map((i) => i.product)} className="w-full" />
      <div className="pt-[9px]">
        <span className="block text-[9.5px] font-semibold tracking-[0.1em] text-neutral-700 uppercase">
          {list.length} pieces
        </span>
        <span className="mt-1 block text-[13px] font-semibold">
          {formatPrice(total, "SEK")}
        </span>
      </div>
    </Link>
  );
}

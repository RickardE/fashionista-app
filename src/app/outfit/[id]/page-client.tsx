"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRightIcon,
  BookmarkIcon,
  ChevronLeftIcon,
  RefreshIcon,
} from "@/components/icons";
import { OutfitComposition } from "@/components/OutfitComposition";
import { SwapSheet } from "@/components/SwapSheet";
import { formatPrice } from "@/lib/format";
import {
  alternativesFor,
  generateOutfit,
  outfitItemList,
  outfitTotal,
  reasonForLook,
} from "@/lib/outfits";
import { useStyleProfile } from "@/lib/store/style-profile-context";
import type { OutfitItems, OutfitRole } from "@/lib/types";

export function OutfitPageClient({ anchorId }: { anchorId: string }) {
  const router = useRouter();
  const { effectiveAffinity, saveOutfit } = useStyleProfile();

  const [phase, setPhase] = useState<"building" | "result">("building");
  const [items, setItems] = useState<OutfitItems>(() =>
    generateOutfit(anchorId, effectiveAffinity),
  );
  const [swapRole, setSwapRole] = useState<OutfitRole | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setPhase("result"), 1700);
    return () => clearTimeout(timer);
  }, []);

  const list = useMemo(() => outfitItemList(items), [items]);
  const total = useMemo(() => outfitTotal(items), [items]);
  const reason = useMemo(
    () => reasonForLook(items, effectiveAffinity),
    [items, effectiveAffinity],
  );
  const swapAlternatives = useMemo(
    () => (swapRole ? alternativesFor(swapRole, items, effectiveAffinity) : []),
    [swapRole, items, effectiveAffinity],
  );

  function handleSwap(role: OutfitRole, productId: string) {
    setItems((prev) => ({ ...prev, [role]: productId }));
    setSaved(false);
    setSwapRole(null);
  }

  function handleSave() {
    saveOutfit(anchorId, items);
    setSaved(true);
  }

  if (phase === "building") {
    return (
      <div className="flex h-dvh flex-col justify-end bg-paper px-[30px] pb-[46px]">
        <div className="animate-rise font-serif text-[34px] leading-[1.08]">
          Building
          <br />
          your look&hellip;
        </div>
        <div className="mt-[26px] flex flex-col gap-[9px]">
          <div className="animate-rise text-[13px] font-medium text-neutral-700 [animation-delay:0.1s]">
            Reading the anchor piece
          </div>
          <div className="animate-rise text-[13px] font-medium text-neutral-700 [animation-delay:0.55s]">
            Matching your style
          </div>
          <div className="animate-rise text-[13px] font-medium text-neutral-700 [animation-delay:1s]">
            Composing the look
          </div>
        </div>
        <div className="relative mt-[30px] h-[2px] overflow-hidden bg-neutral-300">
          <div className="animate-grow absolute inset-0 bg-ink [animation-duration:1.6s] [animation-timing-function:cubic-bezier(0.4,0.1,0.2,1)]" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-paper">
      <div className="flex h-[52px] flex-none items-center justify-between px-[18px] pl-4 [padding-top:env(safe-area-inset-top)]">
        <button
          onClick={() => router.push("/discover")}
          className="flex items-center gap-[7px] px-1 py-2 text-[11px] font-semibold tracking-[0.1em] text-neutral-700 uppercase"
        >
          <ChevronLeftIcon />
          Back
        </button>
        <button
          onClick={handleSave}
          aria-label={saved ? "Look saved" : "Save look"}
          className="flex h-11 w-11 items-center justify-center"
        >
          <BookmarkIcon filled={saved} className={saved ? "text-accent-700" : ""} />
        </button>
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto">
        <div className="animate-rise px-[22px] pb-10">
          <div className="text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
            STYLEAI built this look for you
          </div>
          <div className="mt-2 font-serif text-[30px] leading-[1.08]">
            Your look
          </div>

          <OutfitComposition
            products={list.map((i) => i.product)}
            className="mt-5 aspect-square w-full"
            priority
          />

          <div className="mt-1">
            {list.map(({ role, product }) => (
              <div
                key={role}
                className="flex items-center justify-between gap-3 border-b border-neutral-300 py-3.5"
              >
                <button
                  onClick={() => router.push(`/product/${product.id}`)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block text-[9px] font-semibold tracking-[0.1em] text-neutral-700 uppercase">
                    {product.brand}
                  </span>
                  <span className="mt-0.5 block truncate text-[15px] font-semibold">
                    {product.name}
                  </span>
                </button>
                <span className="flex-none text-[13px] font-medium text-neutral-700">
                  {formatPrice(product.price, product.currency)}
                </span>
                <button
                  onClick={() => setSwapRole(role)}
                  className="flex flex-none items-center gap-[5px] text-[10px] font-semibold tracking-[0.08em] text-neutral-700 uppercase transition-colors hover:text-ink"
                >
                  <RefreshIcon />
                  Swap
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between py-4">
            <span className="text-[13px] font-medium text-neutral-700">Total</span>
            <span className="text-[19px] font-semibold">
              {formatPrice(total, "SEK")}
            </span>
          </div>

          <button className="flex h-[54px] w-full items-center justify-between bg-ink px-5 text-[13px] font-semibold tracking-[0.1em] text-paper uppercase transition-colors hover:bg-neutral-800">
            <span>Shop look</span>
            <ArrowUpRightIcon />
          </button>

          <div className="mt-[30px] border-t border-neutral-300 pt-[18px]">
            <div className="text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
              Why this look
            </div>
            <div className="mt-[11px] text-[15px] leading-[1.6] font-medium text-pretty">
              {reason}
            </div>
          </div>
        </div>
      </div>

      {swapRole && (
        <SwapSheet
          role={swapRole}
          alternatives={swapAlternatives}
          onPick={(product) => handleSwap(swapRole, product.id)}
          onClose={() => setSwapRole(null)}
        />
      )}
    </div>
  );
}

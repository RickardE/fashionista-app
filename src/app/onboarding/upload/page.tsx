"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon, PlusIcon } from "@/components/icons";
import { PrimaryButton } from "@/components/ui/Button";
import { INSPIRATION_TILES } from "@/lib/data/products";
import { PRODUCTS_BY_ID } from "@/lib/data/products";

export default function UploadInspirationPage() {
  const router = useRouter();
  const [picks, setPicks] = useState<number[]>([]);

  function toggle(i: number) {
    setPicks((prev) => {
      const at = prev.indexOf(i);
      if (at >= 0) return prev.filter((p) => p !== i);
      if (prev.length >= 5) return prev;
      return [...prev, i];
    });
  }

  const canAnalyse = picks.length >= 3;

  return (
    <div className="animate-rise flex h-dvh flex-col">
      <div className="px-[22px] pt-4 pb-4">
        <button
          onClick={() => router.push("/onboarding")}
          className="mb-5 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase"
        >
          <ChevronLeftIcon />
          Back
        </button>
        <div className="font-serif text-[30px] leading-[1.08]">
          Show us what you love.
        </div>
        <div className="mt-2.5 flex items-baseline justify-between">
          <span className="text-[13px] leading-[1.5] text-neutral-700">
            Choose three to five images.
          </span>
          <span className="text-[11px] font-semibold tracking-[0.08em] text-neutral-700">
            {picks.length} / 5
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-[22px] pb-5">
        <div className="grid grid-cols-3 gap-1.5">
          {INSPIRATION_TILES.map((tile, i) => {
            const on = picks.includes(i);
            const num = picks.indexOf(i) + 1;
            const product = PRODUCTS_BY_ID[tile.productId];
            return (
              <div
                key={tile.label}
                className="relative aspect-[3/4] w-full min-w-0 overflow-hidden bg-neutral-200"
              >
                <Image
                  src={product.image}
                  alt={tile.label}
                  fill
                  sizes="130px"
                  className="object-cover"
                />
                <button
                  onClick={() => toggle(i)}
                  className={`absolute top-[5px] right-[5px] z-[3] flex h-[22px] w-[22px] items-center justify-center border text-[10px] font-semibold ${
                    on
                      ? "border-ink bg-ink text-paper"
                      : "border-neutral-400 bg-[rgba(248,244,244,0.82)] text-ink"
                  }`}
                >
                  {on ? num : <PlusIcon />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-3.5 text-[12px] leading-[1.6] text-neutral-700">
          Tap a frame to drop in your own photo. Tap the corner to select it.
        </div>
      </div>

      <div className="px-[22px] pb-8">
        {canAnalyse ? (
          <PrimaryButton onClick={() => router.push("/onboarding/analysis")}>
            Read my style
          </PrimaryButton>
        ) : (
          <div className="flex h-[54px] w-full items-center justify-between border border-neutral-300 px-5 text-[13px] font-semibold tracking-[0.13em] text-neutral-500 uppercase">
            <span>Select three to continue</span>
          </div>
        )}
      </div>
    </div>
  );
}

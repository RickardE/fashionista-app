"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ProductTile } from "@/components/ProductTile";
import { TopBar } from "@/components/TopBar";
import { ArrowRightIcon } from "@/components/icons";
import { PRODUCTS, PRODUCTS_BY_ID } from "@/lib/data/products";
import { useStyleProfile } from "@/lib/store/style-profile-context";

export default function SavedPage() {
  const router = useRouter();
  const { state } = useStyleProfile();
  const [category, setCategory] = useState("All");

  const savedIds = useMemo(
    () => PRODUCTS.map((p) => p.id).filter((id) => state.liked[id]),
    [state.liked],
  );
  const categories = useMemo(
    () => [
      "All",
      ...Array.from(new Set(savedIds.map((id) => PRODUCTS_BY_ID[id].category))),
    ],
    [savedIds],
  );
  const shown = savedIds.filter(
    (id) => category === "All" || PRODUCTS_BY_ID[id].category === category,
  );

  return (
    <>
      <TopBar title="Your collection" meta={`${savedIds.length} saved`} />
      <main className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {savedIds.length === 0 ? (
          <div className="flex h-full flex-col justify-center px-[22px] py-10">
            <div className="h-[2px] bg-divider" />
            <div className="mt-[22px] font-serif text-[30px] leading-[1.1]">
              Nothing saved
              <br />
              just yet.
            </div>
            <p className="mt-3.5 mb-6 max-w-[27ch] text-[13px] leading-[1.6] text-neutral-700">
              Like a piece in your feed and it lands here, sorted as your
              collection grows.
            </p>
            <button
              onClick={() => router.push("/discover")}
              className="flex h-[52px] items-center justify-between border border-neutral-400 px-5 text-[11px] font-semibold tracking-[0.16em] uppercase transition-colors hover:border-ink"
            >
              <span>Back to discovery</span>
              <ArrowRightIcon />
            </button>
          </div>
        ) : (
          <div className="px-[22px] pt-1.5 pb-10">
            <div className="no-scrollbar flex gap-[7px] overflow-x-auto pb-4">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`border px-3 py-2 text-[9px] font-semibold tracking-[0.14em] whitespace-nowrap uppercase ${
                    category === c
                      ? "border-ink bg-ink text-paper"
                      : "border-neutral-400"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-4">
              {shown.map((id) => (
                <ProductTile key={id} product={PRODUCTS_BY_ID[id]} compact />
              ))}
            </div>
          </div>
        )}
      </main>
    </>
  );
}

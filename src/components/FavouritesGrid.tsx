"use client";

import Image from "next/image";
import { PlusIcon } from "@/components/icons";
import type { InspirationTile } from "@/lib/use-inspiration";
import type { StyleTag } from "@/lib/types";

/** At most this many favourites can be picked. */
export const MAX_FAVOURITES = 5;

/** Toggles a tile in the pick list, keeping pick order and the maximum. */
export function togglePick(picks: number[], i: number): number[] {
  if (picks.includes(i)) return picks.filter((p) => p !== i);
  return picks.length >= MAX_FAVOURITES ? picks : [...picks, i];
}

/** A taste head start from the picked pieces: one point per tag. */
export function affinityFromPicks(tiles: InspirationTile[], picks: number[]): Partial<Record<StyleTag, number>> {
  const affinity: Partial<Record<StyleTag, number>> = {};
  picks.forEach((i) => {
    tiles[i]?.product.tags.forEach((tag) => {
      affinity[tag] = (affinity[tag] ?? 0) + 1;
    });
  });
  return affinity;
}

/** Catalogue pieces to pick favourites from, numbered in the order they were picked. */
export function FavouritesGrid({
  tiles,
  status,
  onRetry,
  picks,
  onToggle,
}: {
  tiles: InspirationTile[];
  status: "loading" | "ready" | "error";
  onRetry: () => void;
  picks: number[];
  onToggle: (i: number) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-3 gap-1.5">
        {status === "loading" &&
          Array.from({ length: 9 }, (_, i) => <div key={i} className="aspect-[3/4] w-full bg-neutral-200" />)}
        {tiles.map((tile, i) => {
          const at = picks.indexOf(i);
          const on = at >= 0;
          return (
            <button
              key={tile.label}
              onClick={() => onToggle(i)}
              aria-pressed={on}
              className="relative aspect-[3/4] w-full min-w-0 overflow-hidden bg-neutral-200"
            >
              <Image src={tile.product.image} alt={tile.label} fill sizes="130px" className="object-cover" />
              {on && <span className="absolute inset-0 border-2 border-ink" />}
              <span
                className={`absolute top-[5px] right-[5px] z-[3] flex h-[22px] w-[22px] items-center justify-center border text-[10px] font-semibold ${
                  on ? "border-ink bg-ink text-paper" : "border-neutral-400 bg-[rgba(248,244,244,0.82)] text-ink"
                }`}
              >
                {on ? at + 1 : <PlusIcon />}
              </span>
            </button>
          );
        })}
      </div>
      {status === "error" && (
        <p className="mt-3.5 text-[13px] leading-[1.6] text-neutral-700">
          We couldn&rsquo;t load pieces to choose from.{" "}
          <button onClick={onRetry} className="font-semibold underline">
            Try again
          </button>
        </p>
      )}
    </>
  );
}

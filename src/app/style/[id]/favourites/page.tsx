"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { affinityFromPicks, FavouritesGrid, MAX_FAVOURITES, togglePick } from "@/components/FavouritesGrid";
import { ChevronLeftIcon } from "@/components/icons";
import { PrimaryButton } from "@/components/ui/Button";
import { useStyleProfile } from "@/lib/store/style-profile-context";
import { useInspiration } from "@/lib/use-inspiration";

/** Adds a few picked favourites to one style's taste. */
export default function StyleFavouritesPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { state, addSeedAffinity } = useStyleProfile();
  const style = state.styles[params.id];
  const inspiration = useInspiration(style?.gender);
  const [picks, setPicks] = useState<number[]>([]);
  const back = () => router.push(style ? `/style/${style.id}` : "/profile");

  if (!style) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-[14px] text-neutral-700">This style isn&rsquo;t around anymore.</p>
        <button onClick={back} className="text-[11px] font-semibold tracking-[0.16em] uppercase underline">
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="animate-rise flex h-dvh flex-col">
      <div className="px-[22px] pt-4 pb-4 [padding-top:env(safe-area-inset-top)]">
        <button
          onClick={back}
          className="mb-5 flex items-center gap-1.5 py-2 text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase"
        >
          <ChevronLeftIcon />
          {style.name}
        </button>
        <div className="font-serif text-[30px] leading-[1.08]">Pick a few favourites.</div>
        <div className="mt-2.5 flex items-baseline justify-between gap-4">
          <span className="text-[13px] leading-[1.5] text-neutral-700">
            Pieces you like for {style.name}. Its feed leans towards them.
          </span>
          <span className="flex-none text-[11px] font-semibold tracking-[0.08em] text-neutral-700">
            {picks.length} / {MAX_FAVOURITES}
          </span>
        </div>
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto px-[22px] pb-5">
        <FavouritesGrid
          tiles={inspiration.tiles}
          status={inspiration.status}
          onRetry={inspiration.retry}
          picks={picks}
          onToggle={(i) => setPicks((p) => togglePick(p, i))}
        />
      </div>

      <div className="px-[22px] pb-8">
        <PrimaryButton
          disabled={picks.length === 0}
          onClick={() => {
            addSeedAffinity(style.id, affinityFromPicks(inspiration.tiles, picks));
            back();
          }}
        >
          Add to {style.name}
        </PrimaryButton>
      </div>
    </div>
  );
}

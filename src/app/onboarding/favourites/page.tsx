"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { affinityFromPicks, FavouritesGrid, MAX_FAVOURITES, togglePick } from "@/components/FavouritesGrid";
import { ChevronLeftIcon } from "@/components/icons";
import { PrimaryButton } from "@/components/ui/Button";
import { useStyleProfile } from "@/lib/store/style-profile-context";
import { useInspiration } from "@/lib/use-inspiration";

const MIN_FAVOURITES = 3;

/** Optional head start: a few catalogue pieces the user likes seed their first style. */
export default function OnboardingFavouritesPage() {
  const router = useRouter();
  const { activeStyle, addSeedAffinity, completeOnboarding } = useStyleProfile();
  const inspiration = useInspiration(activeStyle.gender);
  const [picks, setPicks] = useState<number[]>([]);

  function finish(withPicks: boolean) {
    if (withPicks) addSeedAffinity(activeStyle.id, affinityFromPicks(inspiration.tiles, picks));
    completeOnboarding();
    router.push("/products");
  }

  return (
    <div className="animate-rise flex h-dvh flex-col">
      <div className="px-[22px] pt-4 pb-4 [padding-top:env(safe-area-inset-top)]">
        <button
          onClick={() => router.push("/onboarding/shopping-for")}
          className="mb-5 flex items-center gap-1.5 py-2 text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase"
        >
          <ChevronLeftIcon />
          Back
        </button>
        <div className="mb-2.5 text-[10px] font-semibold tracking-[0.14em] text-neutral-700 uppercase">
          Step 2 of 2 &middot; Optional
        </div>
        <div className="font-serif text-[30px] leading-[1.08]">Pick a few favourites.</div>
        <div className="mt-2.5 flex items-baseline justify-between gap-4">
          <span className="text-[13px] leading-[1.5] text-neutral-700">
            Choose {MIN_FAVOURITES} to {MAX_FAVOURITES} pieces you like. It gives your feed a head start.
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
        <PrimaryButton disabled={picks.length < MIN_FAVOURITES} onClick={() => finish(true)}>
          {picks.length < MIN_FAVOURITES ? `Pick ${MIN_FAVOURITES - picks.length} more` : "Start swiping"}
        </PrimaryButton>
        <button
          onClick={() => finish(false)}
          className="mt-3 w-full py-2 text-center text-[13px] text-neutral-700 underline underline-offset-2"
        >
          Skip, just start swiping
        </button>
      </div>
    </div>
  );
}

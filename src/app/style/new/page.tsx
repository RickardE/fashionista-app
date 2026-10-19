"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { affinityFromPicks, FavouritesGrid, togglePick } from "@/components/FavouritesGrid";
import { ChevronLeftIcon } from "@/components/icons";
import { GenderToggle } from "@/components/GenderChoice";
import { PrimaryButton } from "@/components/ui/Button";
import { useInspiration } from "@/lib/use-inspiration";
import { useStyleProfile } from "@/lib/store/style-profile-context";
import type { ShopperGender } from "@/lib/types";

type Phase = "name" | "inspiration" | "creating";

export default function NewStylePage() {
  const router = useRouter();
  const { createStyle, activeStyle } = useStyleProfile();
  // New styles start from the current style's gender (derived, so it's right
  // even before saved state has loaded); the user can change it here.
  const [pickedGender, setGender] = useState<ShopperGender | undefined>();
  const gender = pickedGender ?? activeStyle.gender;
  const inspiration = useInspiration(gender);
  const [phase, setPhase] = useState<Phase>("name");
  const [name, setName] = useState("");
  const [picks, setPicks] = useState<number[]>([]);
  const [ready, setReady] = useState(false);

  function finish() {
    createStyle({ name: name.trim(), seedAffinity: affinityFromPicks(inspiration.tiles, picks), gender });
    setPhase("creating");
  }

  useEffect(() => {
    if (phase !== "creating") return;
    const t1 = setTimeout(() => setReady(true), 1400);
    const t2 = setTimeout(() => router.push("/products"), 2300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [phase, router]);

  if (phase === "creating") {
    return (
      <div className="flex h-dvh flex-col justify-end bg-paper px-[30px] pb-[46px]">
        <div
          key={ready ? "ready" : "creating"}
          className="animate-rise font-serif text-[34px] leading-[1.08]"
        >
          {ready ? (
            <>
              Your style
              <br />
              is ready.
            </>
          ) : (
            <>
              Creating
              <br />
              your style&hellip;
            </>
          )}
        </div>
        {!ready && (
          <div className="relative mt-[30px] h-[2px] overflow-hidden bg-neutral-300">
            <div className="animate-grow absolute inset-0 bg-ink [animation-duration:1.4s] [animation-timing-function:cubic-bezier(0.4,0.1,0.2,1)]" />
          </div>
        )}
      </div>
    );
  }

  if (phase === "name") {
    return (
      <div className="animate-rise flex h-dvh flex-col px-[30px] pb-10">
        <div className="pt-4 pb-4 [padding-top:env(safe-area-inset-top)]">
          <button
            onClick={() => router.push("/profile")}
            className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase"
          >
            <ChevronLeftIcon />
            Back
          </button>
        </div>
        <div className="flex flex-1 flex-col justify-center pb-5">
          <div className="mb-[18px] text-[10px] font-semibold tracking-[0.14em] text-neutral-700 uppercase">
            Create your style
          </div>
          <div className="font-serif text-[36px] leading-[1.06]">
            Name your
            <br />
            style.
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim() && gender) setPhase("inspiration");
            }}
            placeholder="My summer style"
            autoFocus
            className="mt-6 w-full border-b-2 border-ink bg-transparent pb-2.5 text-[18px] outline-none placeholder:text-neutral-400"
          />
          <div className="mt-8 mb-2.5 text-[10px] font-semibold tracking-[0.14em] text-neutral-700 uppercase">
            Shopping for
          </div>
          <GenderToggle value={gender} onChange={setGender} />
        </div>
        <PrimaryButton
          disabled={!name.trim() || !gender}
          onClick={() => setPhase("inspiration")}
        >
          Continue
        </PrimaryButton>
      </div>
    );
  }

  return (
    <div className="animate-rise flex h-dvh flex-col">
      <div className="px-[22px] pt-4 pb-4 [padding-top:env(safe-area-inset-top)]">
        <button
          onClick={() => setPhase("name")}
          className="mb-5 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase"
        >
          <ChevronLeftIcon />
          Back
        </button>
        <div className="text-[10px] font-semibold tracking-[0.14em] text-neutral-700 uppercase">
          Pick favourites
        </div>
        <div className="mt-2.5 font-serif text-[28px] leading-[1.1]">
          Anything that captures it?
        </div>
        <div className="mt-2 text-[13px] leading-[1.5] text-neutral-700">
          Optional — tap a few pieces, or skip and start discovering.
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-[22px] pb-5">
        <FavouritesGrid
          tiles={inspiration.tiles}
          status={inspiration.status}
          onRetry={inspiration.retry}
          picks={picks}
          onToggle={(i) => setPicks((p) => togglePick(p, i))}
        />
      </div>

      <div className="px-[22px] pb-8">
        <PrimaryButton onClick={finish}>
          {picks.length ? "Create style" : "Start discovering"}
        </PrimaryButton>
      </div>
    </div>
  );
}

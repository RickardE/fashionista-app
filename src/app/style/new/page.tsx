"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon, PlusIcon } from "@/components/icons";
import { PrimaryButton } from "@/components/ui/Button";
import { INSPIRATION_TILES, PRODUCTS_BY_ID } from "@/lib/data/products";
import { useStyleProfile } from "@/lib/store/style-profile-context";
import type { StyleTag } from "@/lib/types";

type Phase = "name" | "inspiration" | "creating";

export default function NewStylePage() {
  const router = useRouter();
  const { createStyle } = useStyleProfile();
  const [phase, setPhase] = useState<Phase>("name");
  const [name, setName] = useState("");
  const [picks, setPicks] = useState<number[]>([]);
  const [ready, setReady] = useState(false);

  function toggle(i: number) {
    setPicks((prev) => {
      const at = prev.indexOf(i);
      if (at >= 0) return prev.filter((p) => p !== i);
      if (prev.length >= 5) return prev;
      return [...prev, i];
    });
  }

  function finish() {
    const seedAffinity: Partial<Record<StyleTag, number>> = {};
    picks.forEach((i) => {
      const product = PRODUCTS_BY_ID[INSPIRATION_TILES[i].productId];
      product?.tags.forEach((tag) => {
        seedAffinity[tag] = (seedAffinity[tag] ?? 0) + 1;
      });
    });
    createStyle({ name: name.trim(), seedAffinity });
    setPhase("creating");
  }

  useEffect(() => {
    if (phase !== "creating") return;
    const t1 = setTimeout(() => setReady(true), 1400);
    const t2 = setTimeout(() => router.push("/discover"), 2300);
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
              if (e.key === "Enter" && name.trim()) setPhase("inspiration");
            }}
            placeholder="My summer style"
            autoFocus
            className="mt-6 w-full border-b-2 border-ink bg-transparent pb-2.5 text-[18px] outline-none placeholder:text-neutral-400"
          />
        </div>
        <PrimaryButton
          disabled={!name.trim()}
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
          Add inspiration
        </div>
        <div className="mt-2.5 font-serif text-[28px] leading-[1.1]">
          Anything that captures it?
        </div>
        <div className="mt-2 text-[13px] leading-[1.5] text-neutral-700">
          Optional — tap a few pieces, or skip and start discovering.
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
      </div>

      <div className="px-[22px] pb-8">
        <PrimaryButton onClick={finish}>
          {picks.length ? "Create style" : "Start discovering"}
        </PrimaryButton>
      </div>
    </div>
  );
}

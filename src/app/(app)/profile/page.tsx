"use client";

import { useRouter } from "next/navigation";
import { ChevronRightIcon } from "@/components/icons";
import { TopBar } from "@/components/TopBar";
import { TAG_LABELS } from "@/lib/data/products";
import { accuracyFor, topTags } from "@/lib/personalization";
import { useStyleProfile } from "@/lib/store/style-profile-context";

const FALLBACK_TAGS = ["relaxed", "neutral", "knitwear"] as const;

export default function ProfilePage() {
  const router = useRouter();
  const { state, restart } = useStyleProfile();

  const accuracy = accuracyFor(state.interactions);
  const tags = topTags(state.affinity, 3);
  const affinityList = (tags.length ? tags : FALLBACK_TAGS).map((tag, i) => ({
    label: TAG_LABELS[tag].charAt(0).toUpperCase() + TAG_LABELS[tag].slice(1),
    note: tags.length ? (i === 0 ? "strongest signal" : "growing") : "from your inspiration",
  }));

  function resetPrototype() {
    restart();
    router.push("/");
  }

  return (
    <>
      <TopBar title="Your style" meta="Since May 2026" />
      <main className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div className="px-[22px] pt-1.5 pb-10">
          <div className="h-[2px] bg-divider" />
          <div className="mt-5 font-serif text-[32px] leading-[1.05]">
            Modern Scandinavian
          </div>
          <div className="mt-2 text-[13px] leading-[1.5] text-neutral-700">
            Relaxed tailoring · Minimal · Quiet colour
          </div>

          <div className="mt-6 mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
              How well we know you
            </span>
            <span className="text-[11px] font-semibold tracking-[0.06em]">
              {accuracy}%
            </span>
          </div>
          <div className="flex gap-[3px]">
            {Array.from({ length: 12 }, (_, i) => (
              <span
                key={i}
                className={`h-3 flex-1 border border-neutral-400 ${
                  i < Math.round((accuracy / 100) * 12) ? "bg-ink" : ""
                }`}
              />
            ))}
          </div>
          <div className="mt-2 text-[12px] leading-[1.6] text-neutral-700">
            {state.interactions < 3
              ? "Like or dismiss a few pieces and this sharpens quickly."
              : `Built from ${state.interactions} reactions in your feed.`}
          </div>

          <div className="mt-[30px] mb-1 text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
            What you keep choosing
          </div>
          {affinityList.map((a) => (
            <div
              key={a.label}
              className="flex items-baseline justify-between border-b border-neutral-300 py-[11px]"
            >
              <span className="text-[16px] font-semibold">{a.label}</span>
              <span className="text-[12px] text-neutral-700">{a.note}</span>
            </div>
          ))}

          <div className="mt-[30px] mb-1 text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
            Preferences
          </div>
          <button
            onClick={() => router.push("/onboarding/upload")}
            className="flex w-full items-center justify-between border-b border-neutral-300 py-[14px]"
          >
            <span className="text-[15px] font-medium">Add inspiration</span>
            <ChevronRightIcon />
          </button>
          <div className="flex items-center justify-between border-b border-neutral-300 py-[14px]">
            <span className="text-[15px] font-medium">Sizes</span>
            <span className="text-[13px] text-neutral-700">M · 32 · 43</span>
          </div>
          <div className="flex items-center justify-between border-b border-neutral-300 py-[14px]">
            <span className="text-[15px] font-medium">Price range</span>
            <span className="text-[13px] text-neutral-700">
              900 – 4 000 SEK
            </span>
          </div>
          <div className="flex items-center justify-between border-b border-neutral-300 py-[14px]">
            <span className="text-[15px] font-medium">Brands you follow</span>
            <span className="text-[13px] text-neutral-700">7</span>
          </div>
          <button
            onClick={resetPrototype}
            className="flex w-full items-center justify-between border-b border-neutral-300 py-[14px] text-neutral-700"
          >
            <span className="text-[15px] font-medium">Reset this prototype</span>
            <ChevronRightIcon />
          </button>
        </div>
      </main>
    </>
  );
}

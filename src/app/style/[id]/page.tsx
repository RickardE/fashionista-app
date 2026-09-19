"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { Divider } from "@/components/ui/Kicker";
import { TAG_LABELS } from "@/lib/data/products";
import { accuracyFor, topTags } from "@/lib/personalization";
import { useStyleProfile } from "@/lib/store/style-profile-context";

const FALLBACK_TAGS = ["relaxed", "neutral", "knitwear"] as const;

export default function StyleDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { state, styles, activeStyle, setActiveStyle, duplicateStyle, renameStyle } =
    useStyleProfile();
  const [panel, setPanel] = useState<"rename" | "duplicate" | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [duplicateName, setDuplicateName] = useState("");

  const style = styles.find((s) => s.id === params.id);

  if (!style) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-[14px] text-neutral-700">
          This style isn&rsquo;t around anymore.
        </p>
        <button
          onClick={() => router.push("/profile")}
          className="text-[11px] font-semibold tracking-[0.16em] uppercase underline"
        >
          Back
        </button>
      </div>
    );
  }

  const isActive = style.id === activeStyle.id;
  const accuracy = accuracyFor(style.interactions);
  const tags = topTags(style.affinity, 3);
  const affinityList = (tags.length ? tags : FALLBACK_TAGS).map((tag, i) => ({
    label: TAG_LABELS[tag].charAt(0).toUpperCase() + TAG_LABELS[tag].slice(1),
    note: tags.length ? (i === 0 ? "strongest signal" : "growing") : "from your inspiration",
  }));
  const likedCount = Object.keys(style.liked).length;
  const passedCount = Object.keys(style.disliked).length;
  const savedCount = state.savedOutfits.filter((o) => o.styleId === style.id).length;

  function openRename() {
    setRenameValue(style!.name);
    setPanel("rename");
  }

  function confirmRename() {
    const name = renameValue.trim();
    if (!name) return;
    renameStyle(style!.id, name);
    setPanel(null);
  }

  function openDuplicate() {
    setDuplicateName(`${style!.name} copy`);
    setPanel("duplicate");
  }

  function confirmDuplicate() {
    const name = duplicateName.trim();
    if (!name) return;
    duplicateStyle(style!.id, name);
    router.push("/profile");
  }

  return (
    <div className="flex h-dvh flex-col bg-paper">
      <div className="flex h-[52px] flex-none items-center px-[18px] pl-4 [padding-top:env(safe-area-inset-top)]">
        <button
          onClick={() => router.push("/profile")}
          className="flex items-center gap-[7px] px-1 py-2 text-[11px] font-semibold tracking-[0.1em] text-neutral-700 uppercase"
        >
          <ChevronLeftIcon />
          My styles
        </button>
      </div>

      <div className="no-scrollbar animate-rise flex-1 overflow-y-auto px-[22px] pb-12">
        <div className="flex items-center gap-2.5">
          <span className="font-serif text-[36px] leading-[1.08]">
            {style.name}
          </span>
          {isActive && (
            <span className="text-[9px] font-semibold tracking-[0.1em] text-accent-700 uppercase">
              Active
            </span>
          )}
        </div>
        <div className="mt-1.5 text-[14px] leading-[1.5] text-neutral-700">
          {style.description}
        </div>

        {!isActive && (
          <SecondaryButton className="mt-4 h-11" onClick={() => setActiveStyle(style!.id)}>
            Set as active style
          </SecondaryButton>
        )}

        <Divider className="mt-6" />

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
          {style.interactions < 3
            ? "Like or dismiss a few pieces and this sharpens quickly."
            : `Built from ${style.interactions} reactions in your feed.`}
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

        <div className="mt-[30px] mb-2.5 text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
          Recent activity
        </div>
        <div className="flex items-baseline gap-4 text-[15px] font-medium">
          <span>{likedCount} liked</span>
          <span className="text-neutral-400">·</span>
          <span>{passedCount} passed</span>
          <span className="text-neutral-400">·</span>
          <span>{savedCount} saved</span>
        </div>

        <div className="mt-[30px] mb-1 text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
          Style settings
        </div>
        <button
          onClick={openRename}
          className="flex w-full items-center justify-between border-b border-neutral-300 py-[14px] text-left"
        >
          <span className="text-[15px] font-medium">Rename style</span>
          <ChevronRightIcon />
        </button>
        <button
          onClick={() => router.push("/onboarding/upload")}
          className="flex w-full items-center justify-between border-b border-neutral-300 py-[14px] text-left"
        >
          <span className="text-[15px] font-medium">Add inspiration</span>
          <ChevronRightIcon />
        </button>
        <button
          onClick={openDuplicate}
          className="flex w-full items-center justify-between border-b border-neutral-300 py-[14px] text-left"
        >
          <span className="text-[15px] font-medium">Duplicate style</span>
          <ChevronRightIcon />
        </button>

        {panel === "rename" && (
          <div className="mt-5">
            <div className="mb-1.5 text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
              New name
            </div>
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
              className="w-full border-b-2 border-ink bg-transparent pb-2 text-[16px] outline-none"
            />
            <div className="mt-3 flex gap-2.5">
              <SecondaryButton className="h-11 flex-1" onClick={() => setPanel(null)}>
                Cancel
              </SecondaryButton>
              <PrimaryButton
                className="h-11 flex-1"
                disabled={!renameValue.trim()}
                onClick={confirmRename}
              >
                Save
              </PrimaryButton>
            </div>
          </div>
        )}

        {panel === "duplicate" && (
          <div className="mt-5">
            <div className="mb-1.5 text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
              Name the copy
            </div>
            <input
              value={duplicateName}
              onChange={(e) => setDuplicateName(e.target.value)}
              autoFocus
              className="w-full border-b-2 border-ink bg-transparent pb-2 text-[16px] outline-none"
            />
            <div className="mt-3 flex gap-2.5">
              <SecondaryButton className="h-11 flex-1" onClick={() => setPanel(null)}>
                Cancel
              </SecondaryButton>
              <PrimaryButton
                className="h-11 flex-1"
                disabled={!duplicateName.trim()}
                onClick={confirmDuplicate}
              >
                Duplicate
              </PrimaryButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

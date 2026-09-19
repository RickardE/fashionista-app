"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeftIcon, CopyIcon } from "@/components/icons";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { Divider } from "@/components/ui/Kicker";
import { colorsFor, fitsFor, keyPiecesFor } from "@/lib/style-derive";
import { useStyleProfile } from "@/lib/store/style-profile-context";

export default function StyleDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { styles, activeStyle, setActiveStyle, duplicateStyle } =
    useStyleProfile();
  const [duplicating, setDuplicating] = useState(false);
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
  const words = style.description.split(" · ").filter(Boolean);
  const colors = colorsFor(style);
  const fits = fitsFor(style);
  const keyPieces = keyPiecesFor(style);

  function startDuplicate() {
    setDuplicateName(`${style!.name} copy`);
    setDuplicating(true);
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
          Back
        </button>
      </div>

      <div className="no-scrollbar animate-rise flex-1 overflow-y-auto px-[22px] pb-10">
        <div className="text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
          {isActive ? "Active style" : "Style"}
        </div>
        <div className="mt-3 font-serif text-[36px] leading-[1.08]">
          {style.name}
        </div>
        <div className="mt-2">
          {(words.length ? words : ["Just getting started"]).map((w) => (
            <div key={w} className="text-[15px] leading-[1.5] text-neutral-700">
              {w}
            </div>
          ))}
        </div>
        <div className="mt-3 text-[12px] font-medium text-neutral-500">
          {style.interactions} interaction{style.interactions === 1 ? "" : "s"}
        </div>

        <Divider className="mt-6" />

        <div className="border-b border-neutral-300 py-[18px]">
          <div className="mb-3 text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
            Colours
          </div>
          <div className="text-[16px] font-semibold">{colors.join(" · ")}</div>
        </div>

        <div className="border-b border-neutral-300 py-[18px]">
          <div className="mb-2.5 text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
            Fit
          </div>
          <div className="text-[16px] font-semibold">{fits.join(" · ")}</div>
        </div>

        <div className="py-[18px]">
          <div className="mb-3 text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
            Key pieces
          </div>
          {keyPieces.map((piece) => (
            <div
              key={piece}
              className="border-t border-neutral-300 py-[9px] text-[16px] font-semibold first:border-t-0"
            >
              {piece}
            </div>
          ))}
        </div>

        <div className="mt-6">
          {!isActive && (
            <PrimaryButton onClick={() => setActiveStyle(style!.id)}>
              Set as active style
            </PrimaryButton>
          )}

          {!duplicating ? (
            <button
              onClick={startDuplicate}
              className="mt-2.5 flex w-full items-center justify-center gap-[7px] py-3 text-[11px] font-semibold tracking-[0.1em] text-neutral-700 uppercase"
            >
              <CopyIcon />
              Duplicate style
            </button>
          ) : (
            <div className="mt-4">
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
                <SecondaryButton
                  className="h-11 flex-1"
                  onClick={() => setDuplicating(false)}
                >
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
    </div>
  );
}

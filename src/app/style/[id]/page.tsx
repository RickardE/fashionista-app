"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { GenderToggle } from "@/components/GenderChoice";
import { StyleAvatar } from "@/components/StyleAvatar";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { TAG_LABELS } from "@/lib/style-tags";
import { mergeAffinity, topTags } from "@/lib/personalization";
import { useStyleProfile } from "@/lib/store/style-profile-context";

export default function StyleDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { styles, activeStyle, setActiveStyle, duplicateStyle, renameStyle, setStyleGender } =
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
  const tags = topTags(mergeAffinity(style.seedAffinity, style.affinity), 3);
  const choosing = tags.map(
    (tag) => TAG_LABELS[tag].charAt(0).toUpperCase() + TAG_LABELS[tag].slice(1),
  );

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
        <StyleAvatar style={style} size={56} />
        <div className="flex items-baseline gap-2.5 pt-4">
          <span className="font-serif text-[44px] leading-[1.02] tracking-[-0.015em]">
            {style.name}
          </span>
          {isActive && (
            <span className="text-[9px] font-semibold tracking-[0.1em] text-accent-700 uppercase">
              Active
            </span>
          )}
        </div>
        <div className="mt-3 text-[15px] leading-[1.5] text-neutral-700">
          {style.description}
        </div>

        {!isActive && (
          <SecondaryButton
            className="mt-6 h-12"
            onClick={() => setActiveStyle(style!.id)}
          >
            Use this style
          </SecondaryButton>
        )}

        {choosing.length > 0 && (
          <>
            <div className="mt-10 mb-1 text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
              What you keep choosing
            </div>
            {choosing.map((label) => (
              <div
                key={label}
                className="border-b border-neutral-300 py-[13px] text-[17px] font-semibold"
              >
                {label}
              </div>
            ))}
          </>
        )}

        <div className="mt-10 mb-2.5 text-[10px] font-semibold tracking-[0.12em] text-neutral-500 uppercase">
          Shopping for
        </div>
        <GenderToggle value={style.gender} onChange={(g) => setStyleGender(style!.id, g)} />

        <div className="mt-10 mb-0.5 text-[10px] font-semibold tracking-[0.12em] text-neutral-500 uppercase">
          Style settings
        </div>
        {[
          { label: "Rename style", onClick: openRename },
          { label: "Add inspiration", onClick: () => router.push("/onboarding/upload") },
          { label: "Duplicate style", onClick: openDuplicate },
        ].map((row) => (
          <button
            key={row.label}
            onClick={row.onClick}
            className="flex w-full items-center justify-between py-[11px] text-left text-neutral-700"
          >
            <span className="text-[14px]">{row.label}</span>
            <ChevronRightIcon />
          </button>
        ))}

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

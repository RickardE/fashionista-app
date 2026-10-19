"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, CloseIcon, PlusIcon } from "@/components/icons";
import { GENDER_LABEL } from "@/components/GenderChoice";
import { useStyleProfile } from "@/lib/store/style-profile-context";
import type { Outfit, StyleProfile } from "@/lib/types";

const TRANSITION = { duration: 0.35, ease: [0.22, 0.61, 0.36, 1] as const };

/** "Women · 24 saved · 3 outfits" — what lives inside a style. */
export function styleContents(style: StyleProfile, savedOutfits: Outfit[]): string {
  const saved = Object.keys(style.liked).length;
  const outfits = savedOutfits.filter((o) => o.styleId === style.id).length;
  return [
    style.gender && GENDER_LABEL[style.gender],
    `${saved} saved`,
    `${outfits} ${outfits === 1 ? "outfit" : "outfits"}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The active style, shown by name in the top bar of every screen. A style is
 * a profile of its own — feed, likes and collection — so the control works
 * like an account switcher: it opens a sheet of styles to switch between.
 */
export function StyleSelector() {
  const { activeStyle } = useStyleProfile();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Style: ${activeStyle.name}. Switch style`}
        className="flex h-8 max-w-[160px] items-center gap-1.5 rounded-full border border-neutral-400 pr-2.5 pl-3.5 text-[12px] font-semibold text-ink transition-colors hover:border-ink"
      >
        <span className="truncate">{activeStyle.name}</span>
        <ChevronDownIcon className="flex-none" />
      </button>
      {/* Portalled: the header is its own stacking context, below the bottom nav. */}
      {open && createPortal(<StyleSwitcherSheet onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function StyleSwitcherSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { styles, activeStyle, setActiveStyle, state } = useStyleProfile();
  const [closing, setClosing] = useState(false);

  function close(then?: () => void) {
    if (closing) return;
    setClosing(true);
    setTimeout(() => {
      onClose();
      then?.();
    }, TRANSITION.duration * 1000);
  }

  return (
    <div role="dialog" aria-label="Switch style" className="fixed inset-0 z-40 mx-auto flex max-w-[480px] flex-col justify-end">
      <button
        aria-label="Close"
        onClick={() => close()}
        className="absolute inset-0 bg-ink transition-opacity duration-300"
        style={{ opacity: closing ? 0 : 0.35 }}
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: closing ? "100%" : 0 }}
        transition={TRANSITION}
        className="relative z-10 max-h-[80vh] overflow-y-auto bg-paper pb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex items-start justify-between px-[22px] pt-5 pb-2">
          <div>
            <div className="text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
              Switch style
            </div>
            <p className="mt-1.5 max-w-[30ch] text-[13px] leading-[1.5] text-neutral-700">
              Each style has its own feed, likes and collection.
            </p>
          </div>
          <button aria-label="Close" onClick={() => close()} className="-mr-1 p-1 text-neutral-700">
            <CloseIcon />
          </button>
        </div>

        <div className="px-[22px]">
          {styles.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                if (s.id === activeStyle.id) close();
                else close(() => setActiveStyle(s.id));
              }}
              aria-current={s.id === activeStyle.id || undefined}
              className="flex w-full items-center gap-3 border-b border-neutral-300 py-4 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-serif text-[24px] leading-[1.1]">{s.name}</span>
                <span className="mt-1 block text-[12px] text-neutral-700">
                  {styleContents(s, state.savedOutfits)}
                </span>
              </span>
              {s.id === activeStyle.id && <CheckIcon />}
            </button>
          ))}
        </div>

        <div className="px-[22px] pt-2 pb-6">
          <button
            onClick={() => close(() => router.push("/style/new"))}
            className="flex w-full items-center gap-2 py-3 text-[14px] font-medium text-neutral-700"
          >
            <PlusIcon />
            Create new style
          </button>
          <button
            onClick={() => close(() => router.push("/profile"))}
            className="flex w-full items-center justify-between py-3 text-[14px] font-medium text-neutral-700"
          >
            <span>Manage styles</span>
            <ChevronRightIcon />
          </button>
        </div>
      </motion.div>
    </div>
  );
}

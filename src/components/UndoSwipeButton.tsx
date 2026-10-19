"use client";

import { useState } from "react";
import Image from "next/image";
import { UndoIcon } from "@/components/icons";

/**
 * Undoes the last swipe. The thumbnail names the one card it brings back, and
 * the button disappears once used, so it never reads as a way back through
 * the whole feed.
 */
export function UndoSwipeButton({
  image,
  label,
  visible,
  tip = false,
  onUndo,
}: {
  image?: string;
  label?: string;
  visible: boolean;
  /** One-time hint above the button, the first time it appears. */
  tip?: boolean;
  onUndo: () => void;
}) {
  // Keep showing the last swipe's thumbnail while the button fades out.
  const [shown, setShown] = useState({ image, label });
  if (visible && (image !== shown.image || label !== shown.label)) setShown({ image, label });

  return (
    <button
      onClick={onUndo}
      disabled={!visible}
      aria-hidden={!visible}
      aria-label={shown.label ? `Undo swipe: ${shown.label}` : "Undo swipe"}
      className="absolute right-[22px] bottom-4 z-10 flex items-center gap-2 rounded-full border border-neutral-400 bg-paper py-1 pr-3.5 pl-1 text-[10px] font-semibold tracking-[0.1em] text-neutral-700 uppercase transition-[opacity,border-color,color] duration-300 hover:border-ink hover:text-ink disabled:pointer-events-none"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <span className="relative h-8 w-8 overflow-hidden rounded-full bg-neutral-200">
        {shown.image && <Image src={shown.image} alt="" fill sizes="32px" className="object-cover" draggable={false} />}
      </span>
      <UndoIcon />
      <span>Undo</span>
      {tip && visible && (
        <span
          role="status"
          className="animate-rise absolute right-0 bottom-full mb-2.5 bg-ink px-3 py-2 text-[11px] font-medium tracking-normal whitespace-nowrap text-paper normal-case"
        >
          Swiped by mistake? Undo
          <span aria-hidden className="absolute -bottom-1 right-6 h-2 w-2 rotate-45 bg-ink" />
        </span>
      )}
    </button>
  );
}

/** Backspace or ⌘Z / Ctrl+Z, unless the user is typing. */
export function isUndoKey(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  if (target?.closest("input, textarea, select, [contenteditable]")) return false;
  return e.key === "Backspace" || ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z");
}

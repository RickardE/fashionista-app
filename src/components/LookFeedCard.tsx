"use client";

import { useRef } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { ArrowUpRightIcon } from "@/components/icons";
import { OutfitComposition } from "@/components/OutfitComposition";
import { formatPrice } from "@/lib/format";
import { outfitItemList, outfitTotal } from "@/lib/outfits";
import type { OutfitItems } from "@/lib/types";

const SNAP_BACK = { type: "spring", stiffness: 420, damping: 34 } as const;
const EXIT_TRANSITION = { duration: 0.3, ease: [0.4, 0, 0.7, 0.2] as const };
const MOVE_SLOP = 4;
const DECISION_DISTANCE = 110;
const EXIT_DISTANCE = 560;

interface DragState {
  startX: number;
  moved: boolean;
}

/**
 * A complete-look interstitial in the discovery feed. Mirrors ProductFeedCard's
 * drag mechanics (duplicated rather than shared, since it only ever appears as
 * the front card — no stackPosition/behind-state to reconcile with).
 */
export function LookFeedCard({
  items,
  onOpen,
  onDecide,
}: {
  items: OutfitItems;
  onOpen: () => void;
  onDecide: (direction: 1 | -1) => void;
}) {
  const list = outfitItemList(items);
  const total = outfitTotal(items);

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-260, 260], [-10, 10]);
  const loveOpacity = useTransform(x, [16, DECISION_DISTANCE], [0, 1]);
  const passOpacity = useTransform(x, [-DECISION_DISTANCE, -16], [1, 0]);

  const drag = useRef<DragState | null>(null);
  const settled = useRef(false);

  function onPointerDown(e: React.PointerEvent) {
    if (settled.current) return;
    if ((e.target as HTMLElement).closest("button, a")) return;
    drag.current = { startX: e.clientX, moved: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // pointer capture unsupported — the drag still works without it
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > MOVE_SLOP) drag.current.moved = true;
    x.set(dx);
  }

  function onPointerUp() {
    if (!drag.current || settled.current) {
      drag.current = null;
      return;
    }
    const { moved } = drag.current;
    const dx = x.get();
    drag.current = null;

    if (!moved) {
      x.set(0);
      onOpen();
      return;
    }

    if (Math.abs(dx) > DECISION_DISTANCE) {
      settled.current = true;
      const direction: 1 | -1 = dx > 0 ? 1 : -1;
      animate(x, direction * EXIT_DISTANCE, EXIT_TRANSITION).then(() => {
        onDecide(direction);
      });
    } else {
      animate(x, 0, SNAP_BACK);
    }
  }

  return (
    <>
      <motion.div
        className="absolute inset-0 z-[2] flex h-full w-full flex-col touch-none bg-paper select-none"
        style={{ x, rotate }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        data-active
      >
        <OutfitComposition
          products={list.map((i) => i.product)}
          className="w-full flex-1 min-h-0"
          square={false}
          priority
        />

        <div className="px-[22px] pt-5">
          <span className="block text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
            STYLEAI&rsquo;s look
          </span>
          <span className="mt-[6px] block text-[21px] leading-[1.2] font-semibold tracking-[-0.01em]">
            Complete the look
          </span>
          <span className="mt-[9px] flex items-center gap-2.5">
            <span className="text-[15px] font-semibold">
              {formatPrice(total, "SEK")}
            </span>
            <span className="h-[11px] w-px bg-neutral-400" />
            <span className="text-[13px] text-neutral-700">
              {list.length} pieces
            </span>
          </span>
        </div>
        <button
          onClick={onOpen}
          className="mx-[22px] mt-3.5 flex items-center gap-2 self-start border-b border-neutral-400 pb-[3px] text-[10px] font-semibold tracking-[0.1em] text-neutral-700 uppercase transition-colors hover:border-ink hover:text-ink"
        >
          <span>View the look</span>
          <ArrowUpRightIcon />
        </button>
        <div className="h-5" />
      </motion.div>

      <motion.div
        style={{ opacity: loveOpacity }}
        className="pointer-events-none absolute inset-x-0 top-0 z-[2]"
      >
        <div className="from-paper via-paper/75 h-44 w-full bg-gradient-to-b to-transparent" />
        <div className="absolute inset-x-0 top-14 flex flex-col items-center gap-2">
          <span className="font-serif text-[36px] leading-none text-accent-700 italic">
            Love
          </span>
          <span className="h-px w-10 bg-accent-700" />
        </div>
      </motion.div>

      <motion.div
        style={{ opacity: passOpacity }}
        className="pointer-events-none absolute inset-x-0 top-0 z-[2]"
      >
        <div className="from-paper via-paper/75 h-44 w-full bg-gradient-to-b to-transparent" />
        <div className="absolute inset-x-0 top-14 flex flex-col items-center gap-2">
          <span className="font-serif text-[36px] leading-none text-ink italic">
            Not for me
          </span>
          <span className="bg-ink h-px w-10" />
        </div>
      </motion.div>
    </>
  );
}

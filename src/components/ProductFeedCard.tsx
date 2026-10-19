"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { ArrowUpRightIcon } from "@/components/icons";
import { SwipeFeedback } from "@/components/SwipeFeedback";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/lib/types";

const SNAP_BACK = { type: "spring", stiffness: 420, damping: 34 } as const;
const EXIT_TRANSITION = { duration: 0.3, ease: [0.4, 0, 0.7, 0.2] as const };
const REST_TRANSITION = { duration: 0.4, ease: [0.22, 0.61, 0.36, 1] as const };

const MOVE_SLOP = 4;
const DECISION_DISTANCE = 110;
const EXIT_DISTANCE = 560;
/** The teaching nudge: how far the card leans each way, and the pause between rounds. */
const NUDGE_DISTANCE = 72;
const NUDGE_PAUSE_MS = 2600;

/** 0 = front card, draggable. 1 = the next card, peeking behind it. */
type StackPosition = 0 | 1;

interface DragState {
  /** Pointer x at which the card would sit at rest. */
  startX: number;
  /** Pointer x where the press began, to tell a tap from a drag. */
  pressX: number;
  moved: boolean;
}

export function ProductFeedCard({
  product,
  stackPosition,
  onOpen,
  onDecide,
  enterFrom,
  nudge = false,
}: {
  product: Product;
  stackPosition: StackPosition;
  onOpen: () => void;
  onDecide: (direction: 1 | -1) => void;
  /** Set when an undone swipe brings this card back: the side it flies in from. */
  enterFrom?: 1 | -1;
  /** Teaches the gesture: the card leans right (heart) then left (✕) until it's touched. */
  nudge?: boolean;
}) {
  const isFront = stackPosition === 0;
  const x = useMotionValue(enterFrom ? enterFrom * EXIT_DISTANCE : 0);
  const rotate = useTransform(x, [-260, 260], [-10, 10]);

  const drag = useRef<DragState | null>(null);
  // A returning card can't be dragged until it has landed.
  const settled = useRef(!!enterFrom);

  useEffect(() => {
    if (!enterFrom) return;
    animate(x, 0, SNAP_BACK).then(() => {
      settled.current = false;
    });
    // Runs once, when the returning card mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nudging = nudge && isFront;
  const touched = useRef(false);
  useEffect(() => {
    if (!nudging) return;
    let cancelled = false;
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    (async () => {
      await wait(700);
      while (!cancelled && !touched.current) {
        for (const to of [NUDGE_DISTANCE, 0, -NUDGE_DISTANCE, 0]) {
          if (cancelled || touched.current) return;
          await animate(x, to, { duration: 0.5, ease: "easeInOut" });
        }
        await wait(NUDGE_PAUSE_MS);
      }
    })();
    return () => {
      cancelled = true;
      x.stop();
    };
  }, [nudging, x]);

  function onPointerDown(e: React.PointerEvent) {
    if (!isFront || settled.current) return;
    if (nudging && !touched.current) {
      touched.current = true;
      x.stop();
    }
    if ((e.target as HTMLElement).closest("button, a")) {
      if (x.get() !== 0) animate(x, 0, SNAP_BACK);
      return;
    }
    // Starts from wherever the card is (mid-nudge, it isn't centred).
    drag.current = { startX: e.clientX - x.get(), pressX: e.clientX, moved: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // pointer capture unsupported — the drag still works without it
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(e.clientX - drag.current.pressX) > MOVE_SLOP) drag.current.moved = true;
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
        className={`absolute inset-0 flex h-full w-full flex-col touch-none bg-paper select-none ${
          isFront ? "" : "pointer-events-none"
        }`}
        style={{ x, rotate, zIndex: isFront ? 2 : 1 }}
        animate={{
          scale: isFront ? 1 : 0.94,
          opacity: isFront ? 1 : 0.92,
          y: isFront ? 0 : 14,
        }}
        transition={REST_TRANSITION}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-hidden={!isFront}
        inert={!isFront}
        data-active={isFront || undefined}
      >
        <div className="relative w-full flex-1 min-h-0 bg-neutral-200">
          <Image
            src={product.image}
            alt={`${product.brand} — ${product.name}`}
            fill
            sizes="480px"
            priority={isFront}
            loading={isFront ? undefined : "eager"}
            className="pointer-events-none object-cover"
            draggable={false}
          />
        </div>

        <div className="px-[22px] pt-5">
          <span className="block text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
            {product.brand}
          </span>
          <span className="mt-[6px] block text-[21px] leading-[1.2] font-semibold tracking-[-0.01em]">
            {product.name}
          </span>
          <span className="mt-[9px] block text-[15px] font-semibold">
            {formatPrice(product.price, product.currency)}
          </span>
        </div>
        <button
          onClick={onOpen}
          className="mx-[22px] mt-3.5 flex items-center gap-2 self-start border-b border-neutral-400 pb-[3px] text-[10px] font-semibold tracking-[0.1em] text-neutral-700 uppercase transition-colors hover:border-ink hover:text-ink"
        >
          <span>View details</span>
          <ArrowUpRightIcon />
        </button>
        <div className="h-5" />
        {isFront && <SwipeFeedback x={x} decisionDistance={DECISION_DISTANCE} />}
      </motion.div>

    </>
  );
}

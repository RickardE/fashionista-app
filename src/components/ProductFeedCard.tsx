"use client";

import { useRef } from "react";
import Image from "next/image";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { ArrowUpRightIcon } from "@/components/icons";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/lib/types";

const SNAP_BACK = { type: "spring", stiffness: 420, damping: 34 } as const;
const EXIT_TRANSITION = { duration: 0.3, ease: [0.4, 0, 0.7, 0.2] as const };
const REST_TRANSITION = { duration: 0.4, ease: [0.22, 0.61, 0.36, 1] as const };

const MOVE_SLOP = 4;
const DECISION_DISTANCE = 110;
const EXIT_DISTANCE = 560;

/** 0 = front card, draggable. 1 = the next card, peeking behind it. */
type StackPosition = 0 | 1;

interface DragState {
  startX: number;
  moved: boolean;
}

export function ProductFeedCard({
  product,
  stackPosition,
  onOpen,
  onDecide,
}: {
  product: Product;
  stackPosition: StackPosition;
  onOpen: () => void;
  onDecide: (direction: 1 | -1) => void;
}) {
  const isFront = stackPosition === 0;
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-260, 260], [-10, 10]);
  const loveOpacity = useTransform(x, [16, DECISION_DISTANCE], [0, 1]);
  const passOpacity = useTransform(x, [-DECISION_DISTANCE, -16], [1, 0]);

  const drag = useRef<DragState | null>(null);
  const settled = useRef(false);

  function onPointerDown(e: React.PointerEvent) {
    if (!isFront || settled.current) return;
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
          <span className="block text-[9px] font-semibold tracking-[0.2em] text-neutral-700 uppercase">
            {product.brand}
          </span>
          <span className="mt-[7px] block font-serif text-[27px] leading-[1.08]">
            {product.name}
          </span>
          <span className="mt-[9px] flex items-center gap-2.5">
            <span className="text-[13px]">
              {formatPrice(product.price, product.currency)}
            </span>
            <span className="h-[11px] w-px bg-neutral-400" />
            <span className="text-[12px] text-neutral-700">
              {product.color}
            </span>
          </span>
        </div>
        <button
          onClick={onOpen}
          className="mx-[22px] mt-3.5 flex items-center gap-2 self-start border-b border-neutral-400 pb-[3px] text-[9px] font-semibold tracking-[0.18em] text-neutral-700 uppercase transition-colors hover:border-ink hover:text-ink"
        >
          <span>Why this piece</span>
          <ArrowUpRightIcon />
        </button>
        <div className="h-5" />
      </motion.div>

      {/* Fixed over the viewport (not the dragged card) so the label
          stays legible and centered as the photo moves beneath it. A soft
          tonal scrim (not a badge) keeps the type readable over any photo. */}
      <motion.div
        style={{ opacity: loveOpacity, zIndex: isFront ? 2 : 1 }}
        className="pointer-events-none absolute inset-x-0 top-0"
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
        style={{ opacity: passOpacity, zIndex: isFront ? 2 : 1 }}
        className="pointer-events-none absolute inset-x-0 top-0"
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

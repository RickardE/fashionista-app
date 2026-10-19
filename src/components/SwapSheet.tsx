"use client";

import { Fragment, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { ChevronDownIcon, CloseIcon } from "@/components/icons";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/lib/types";

const TRANSITION = { duration: 0.35, ease: [0.22, 0.61, 0.36, 1] as const };

export interface SwapAlternative {
  product: Product;
  /** False for fallbacks: pieces that clash with the rest of the outfit or that the user disliked. */
  suitable: boolean;
}

export type SwapStatus = "loading" | "ready" | "error";

/**
 * Replacement candidates for one piece, as photos under the piece they'd
 * replace. Batches are appended as the user asks for more; fallbacks are
 * listed under their own heading, after the good matches.
 */
export function SwapSheet({
  current,
  label,
  alternatives,
  status,
  hasMore,
  onMore,
  onRetry,
  onPick,
  onClose,
}: {
  /** The piece being replaced. */
  current: Product;
  /** What's being swapped, e.g. "skirt". */
  label: string;
  alternatives: SwapAlternative[];
  status: SwapStatus;
  hasMore: boolean;
  onMore: () => void;
  onRetry: () => void;
  onPick: (product: Product) => void;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);

  function handleClose() {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, TRANSITION.duration * 1000);
  }

  const firstFallback = alternatives.findIndex((a) => !a.suitable);

  return (
    <div className="fixed inset-0 z-40 mx-auto flex max-w-[480px] flex-col justify-end">
      <button
        aria-label="Close"
        onClick={handleClose}
        className="absolute inset-0 bg-ink transition-opacity duration-300"
        style={{ opacity: closing ? 0 : 0.35 }}
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: closing ? "100%" : 0 }}
        transition={TRANSITION}
        className="relative z-10 max-h-[75vh] overflow-y-auto bg-paper"
      >
        <div className="flex items-center justify-between px-[22px] pt-5 pb-3.5">
          <div>
            <div className="text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
              Works with this outfit
            </div>
            <div className="mt-1 text-[14px] font-medium">
              Swap the {label}
            </div>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close"
            className="flex h-9 w-9 flex-none items-center justify-center text-neutral-700"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="mx-[22px] flex items-center gap-3 bg-neutral-200 p-2.5">
          <div className="relative h-14 w-12 flex-none overflow-hidden bg-neutral-300">
            <Image src={current.image} alt="" fill sizes="48px" className="object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="block text-[9px] font-semibold tracking-[0.1em] text-neutral-700 uppercase">
              Replacing
            </span>
            <span className="mt-0.5 block truncate text-[14px] font-semibold">{current.name}</span>
          </div>
          <span className="flex-none text-[13px] font-medium text-neutral-700">
            {formatPrice(current.price, current.currency)}
          </span>
        </div>

        <div className="px-[22px] pt-4 pb-8">
          <div className="grid grid-cols-3 gap-x-2.5 gap-y-4">
            {alternatives.map(({ product: p }, i) => (
              <Fragment key={p.id}>
                {i === firstFallback && (
                  <div className="col-span-3 border-t border-neutral-300 pt-4 text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
                    {i === 0 ? "No close matches — nearest options" : "Weaker matches"}
                  </div>
                )}
                <button onClick={() => onPick(p)} className="flex min-w-0 flex-col text-left">
                  <div className="relative aspect-[3/4] w-full overflow-hidden bg-neutral-200">
                    <Image
                      src={p.image}
                      alt={`${p.brand} — ${p.name}`}
                      fill
                      sizes="140px"
                      className="object-cover"
                    />
                  </div>
                  <span className="mt-[7px] block truncate text-[9px] font-semibold tracking-[0.1em] text-neutral-700 uppercase">
                    {p.brand}
                  </span>
                  <span className="mt-0.5 line-clamp-2 text-[12px] leading-[1.3] font-semibold">
                    {p.name}
                  </span>
                  <span className="mt-0.5 text-[12px] text-neutral-700">
                    {formatPrice(p.price, p.currency)}
                  </span>
                </button>
              </Fragment>
            ))}
          </div>

          {status === "loading" ? (
            <p className="mt-4 border-t border-neutral-300 py-6 text-[13px] text-neutral-700">
              Finding alternatives&hellip;
            </p>
          ) : status === "error" ? (
            <p className="mt-4 border-t border-neutral-300 py-6 text-[13px] text-neutral-700">
              We couldn&rsquo;t load alternatives.{" "}
              <button onClick={onRetry} className="font-semibold underline">
                Try again
              </button>
            </p>
          ) : hasMore ? (
            <button
              onClick={onMore}
              className="mt-5 flex h-12 w-full items-center justify-between border border-neutral-400 px-[18px] text-[11px] font-semibold tracking-[0.16em] uppercase transition-colors hover:border-ink"
            >
              <span>Show more</span>
              <ChevronDownIcon />
            </button>
          ) : (
            <p className="mt-4 border-t border-neutral-300 py-6 text-[13px] text-neutral-700">
              {alternatives.length ? "No more suitable alternatives." : "No alternatives for this piece right now."}
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}

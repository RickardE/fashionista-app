"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { CloseIcon } from "@/components/icons";
import { formatPrice } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/outfits";
import type { OutfitRole, Product } from "@/lib/types";

const TRANSITION = { duration: 0.35, ease: [0.22, 0.61, 0.36, 1] as const };

export function SwapSheet({
  role,
  alternatives,
  onPick,
  onClose,
}: {
  role: OutfitRole;
  alternatives: Product[];
  onPick: (product: Product) => void;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);

  function handleClose() {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, TRANSITION.duration * 1000);
  }

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
        <div className="flex items-center justify-between px-[22px] pt-5 pb-4">
          <div>
            <div className="text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
              Similar pieces
            </div>
            <div className="mt-1 text-[14px] font-medium">
              Swap the {ROLE_LABEL[role].toLowerCase()}
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
        <div className="px-[22px] pb-8">
          {alternatives.map((p) => (
            <button
              key={p.id}
              onClick={() => onPick(p)}
              className="flex w-full items-center gap-3 border-t border-neutral-300 py-3 text-left"
            >
              <div className="relative h-16 w-14 flex-none overflow-hidden bg-neutral-200">
                <Image
                  src={p.image}
                  alt={`${p.brand} — ${p.name}`}
                  fill
                  sizes="60px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-[9px] font-semibold tracking-[0.1em] text-neutral-700 uppercase">
                  {p.brand}
                </span>
                <span className="mt-0.5 block truncate text-[14px] font-semibold">
                  {p.name}
                </span>
              </div>
              <span className="flex-none text-[13px] font-medium text-neutral-700">
                {formatPrice(p.price, p.currency)}
              </span>
            </button>
          ))}
          {alternatives.length === 0 && (
            <p className="border-t border-neutral-300 py-6 text-[13px] text-neutral-700">
              No other pieces in this category yet.
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}

import Image from "next/image";
import { RefreshIcon } from "@/components/icons";
import { pieceLabel } from "@/lib/outfits";
import type { Product } from "@/lib/types";

/** Per-piece controls on each photo — the outfit page only; the feed card and Saved tiles pass none. */
export interface PieceControls {
  onOpen: (product: Product) => void;
  onSwap: (product: Product) => void;
  /** Swap isn't possible yet (candidates still loading). */
  swapDisabled?: boolean;
  /** The piece that was just swapped in, outlined and marked "New". */
  highlightId?: string;
}

export function OutfitComposition({
  products,
  className = "",
  priority = false,
  square = true,
  controls,
}: {
  products: Product[];
  className?: string;
  priority?: boolean;
  /** false lets the grid fill a flex parent's own height instead of forcing a square. */
  square?: boolean;
  controls?: PieceControls;
}) {
  return (
    <div
      className={`grid grid-cols-2 grid-rows-2 gap-px overflow-hidden bg-neutral-300 ${className}`}
    >
      {products.slice(0, 4).map((product) => {
        const image = (
          <Image
            src={product.image}
            alt={`${product.brand} — ${product.name}`}
            fill
            sizes="240px"
            priority={priority}
            className="pointer-events-none object-cover"
            draggable={false}
          />
        );
        if (!controls) {
          return (
            <div
              key={product.id}
              className={`relative bg-neutral-200 ${square ? "aspect-square" : "h-full"}`}
            >
              {image}
            </div>
          );
        }

        const label = pieceLabel(product);
        const isNew = controls.highlightId === product.id;
        return (
          <div
            key={product.id}
            className={`relative bg-neutral-200 ${square ? "aspect-square" : "h-full"}`}
          >
            <button
              onClick={() => controls.onOpen(product)}
              aria-label={`Open ${product.brand} — ${product.name}`}
              className="absolute inset-0"
            >
              {image}
            </button>
            {isNew && <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_3px_var(--color-ink)]" />}
            <span
              className={`pointer-events-none absolute top-2 left-2 px-[7px] py-1 text-[9px] font-semibold tracking-[0.1em] uppercase ${
                isNew ? "bg-ink text-paper" : "bg-paper/90 text-ink"
              }`}
            >
              {isNew ? "New" : label}
            </span>
            <button
              onClick={() => controls.onSwap(product)}
              disabled={controls.swapDisabled}
              aria-label={`Swap the ${label}`}
              className="absolute right-1.5 bottom-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-ink text-paper shadow-[0_2px_8px_rgba(32,30,29,0.25)] transition-opacity disabled:opacity-40"
            >
              <RefreshIcon className="h-[18px] w-[18px]" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

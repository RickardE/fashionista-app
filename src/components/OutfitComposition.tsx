import Image from "next/image";
import type { Product } from "@/lib/types";

export function OutfitComposition({
  products,
  className = "",
  priority = false,
  square = true,
}: {
  products: Product[];
  className?: string;
  priority?: boolean;
  /** false lets the grid fill a flex parent's own height instead of forcing a square. */
  square?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-2 grid-rows-2 gap-px overflow-hidden bg-neutral-300 ${className}`}
    >
      {products.slice(0, 4).map((product) => (
        <div
          key={product.id}
          className={`relative bg-neutral-200 ${square ? "aspect-square" : "h-full"}`}
        >
          <Image
            src={product.image}
            alt={`${product.brand} — ${product.name}`}
            fill
            sizes="240px"
            priority={priority}
            className="pointer-events-none object-cover"
            draggable={false}
          />
        </div>
      ))}
    </div>
  );
}

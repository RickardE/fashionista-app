import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/lib/types";

export function ProductTile({
  product,
  compact = false,
}: {
  product: Product;
  compact?: boolean;
}) {
  return (
    <div>
      <div className="relative aspect-[3/4] w-full min-w-0 overflow-hidden bg-neutral-200">
        <Image
          src={product.image}
          alt={`${product.brand} — ${product.name}`}
          fill
          sizes="(min-width: 480px) 220px, 45vw"
          className="object-cover"
        />
      </div>
      <Link href={`/product/${product.id}`} className="block w-full pt-[9px]">
        <span
          className={`block font-semibold text-neutral-700 uppercase ${
            compact
              ? "text-[8px] tracking-[0.16em]"
              : "text-[8.5px] tracking-[0.18em]"
          }`}
        >
          {product.brand}
        </span>
        <span
          className={`mt-1 block font-serif leading-[1.15] ${
            compact ? "text-[11px] leading-[1.25] font-sans not-italic" : "text-[17px]"
          }`}
        >
          {product.name}
        </span>
        {!compact && (
          <span className="mt-[5px] block text-[11px] text-neutral-700">
            {formatPrice(product.price, product.currency)}
          </span>
        )}
      </Link>
    </div>
  );
}

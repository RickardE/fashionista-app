"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronLeftIcon, HeartIcon, ArrowUpRightIcon } from "@/components/icons";
import { formatPrice } from "@/lib/format";
import { PRODUCTS_BY_ID } from "@/lib/data/products";
import { rankedIds, reasonFor } from "@/lib/personalization";
import { useStyleProfile } from "@/lib/store/style-profile-context";

export function ProductDetail({
  productId,
  onBack,
}: {
  productId: string;
  onBack: () => void;
}) {
  const { state, toggleDetailLike } = useStyleProfile();
  const product = PRODUCTS_BY_ID[productId];

  if (!product) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-[14px] text-neutral-700">
          This piece isn&rsquo;t in today&rsquo;s edit anymore.
        </p>
        <button
          onClick={onBack}
          className="text-[11px] font-semibold tracking-[0.16em] uppercase underline"
        >
          Back
        </button>
      </div>
    );
  }

  const liked = !!state.liked[productId];
  const reason = reasonFor(product, state.affinity);
  const more = rankedIds(state.affinity)
    .filter((id) => id !== productId)
    .slice(0, 3)
    .map((id) => PRODUCTS_BY_ID[id]);

  return (
    <div className="flex h-full flex-col bg-paper">
      <div className="flex h-[52px] flex-none items-center justify-between px-[18px] pl-4 [padding-top:env(safe-area-inset-top)]">
        <button
          onClick={onBack}
          className="flex items-center gap-[7px] px-1 py-2 text-[11px] font-semibold tracking-[0.1em] text-neutral-700 uppercase"
        >
          <ChevronLeftIcon />
          Back
        </button>
        <button
          onClick={() => toggleDetailLike(productId)}
          aria-label={liked ? "Unlike" : "Like"}
          className="flex h-11 w-11 items-center justify-center"
        >
          <HeartIcon filled={liked} className={liked ? "text-accent-700" : ""} />
        </button>
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto">
        <div className="relative aspect-[390/488] w-full bg-neutral-200">
          <Image
            src={product.image}
            alt={`${product.brand} — ${product.name}`}
            fill
            sizes="480px"
            priority
            className="object-cover"
          />
        </div>
        <div className="px-[22px] pt-[22px] pb-10">
          <div className="text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
            {product.brand}
          </div>
          <div className="mt-[9px] text-[26px] leading-[1.15] font-semibold tracking-[-0.01em]">
            {product.name}
          </div>
          <div className="mt-3 text-[17px] font-semibold">
            {formatPrice(product.price, product.currency)}
          </div>

          <div className="mt-5 h-[2px] bg-divider" />
          <div className="flex justify-between border-b border-neutral-300 py-3">
            <span className="text-[10px] font-semibold tracking-[0.1em] text-neutral-700 uppercase">
              Colour
            </span>
            <span className="text-[14px] font-medium">{product.color}</span>
          </div>
          <div className="flex justify-between border-b border-neutral-300 py-3">
            <span className="text-[10px] font-semibold tracking-[0.1em] text-neutral-700 uppercase">
              Fit
            </span>
            <span className="text-[14px] font-medium">{product.fit}</span>
          </div>
          <div className="flex justify-between border-b border-neutral-300 py-3">
            <span className="text-[10px] font-semibold tracking-[0.1em] text-neutral-700 uppercase">
              Material
            </span>
            <span className="text-[14px] font-medium">{product.material}</span>
          </div>

          <button className="mt-[22px] flex h-[54px] w-full items-center justify-between bg-ink px-5 text-[13px] font-semibold tracking-[0.1em] text-paper uppercase transition-colors hover:bg-neutral-800">
            <span>Shop at {product.retailer}</span>
            <ArrowUpRightIcon />
          </button>

          <div className="mt-[30px] border-t border-neutral-300 pt-[18px]">
            <div className="text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
              Why we picked this
            </div>
            <div className="mt-[11px] text-[15px] leading-[1.6] font-medium text-pretty">
              {reason}
            </div>
          </div>

          {more.length > 0 && (
            <div className="mt-7 border-t border-neutral-300 pt-[18px]">
              <div className="mb-3 text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
                More like this
              </div>
              <div className="grid grid-cols-3 gap-2">
                {more.map((m) => (
                  <Link key={m.id} href={`/product/${m.id}`} className="block">
                    <div className="relative aspect-[3/4] w-full overflow-hidden bg-neutral-200">
                      <Image
                        src={m.image}
                        alt={`${m.brand} — ${m.name}`}
                        fill
                        sizes="130px"
                        className="object-cover"
                      />
                    </div>
                    <span className="mt-[7px] block text-[9.5px] font-semibold tracking-[0.1em] text-neutral-700 uppercase">
                      {m.brand}
                    </span>
                    <span className="mt-1 block text-[12px] leading-[1.3] font-semibold">
                      {m.name}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ChevronLeftIcon,
  HeartIcon,
  ArrowUpRightIcon,
  LayersIcon,
} from "@/components/icons";
import { fetchProducts } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { roleFor, shopperGenderFor } from "@/lib/outfits";
import { useCatalog, useProduct } from "@/lib/store/product-catalog";
import { useStyleProfile } from "@/lib/store/style-profile-context";
import type { Product, ShopperGender } from "@/lib/types";

export function ProductDetail({
  productId,
  initialProduct,
  onBack,
  onBuildOutfit,
}: {
  productId: string;
  /** Server-rendered product for direct links; skips the client fetch. */
  initialProduct?: Product;
  onBack: () => void;
  onBuildOutfit: (productId: string) => void;
}) {
  const { activeStyle, toggleDetailLike } = useStyleProfile();
  const { product, status, retry } = useProduct(productId, initialProduct);
  const more = useMoreLikeThis(product, activeStyle.gender);

  if (!product) {
    const message =
      status === "loading"
        ? null
        : status === "error"
          ? "We couldn’t load this piece right now."
          : "This piece isn’t in today’s edit anymore.";
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        {message && <p className="text-[14px] text-neutral-700">{message}</p>}
        {status === "error" && (
          <button
            onClick={retry}
            className="text-[11px] font-semibold tracking-[0.16em] uppercase underline"
          >
            Try again
          </button>
        )}
        {message && (
          <button
            onClick={onBack}
            className="text-[11px] font-semibold tracking-[0.16em] uppercase underline"
          >
            Back
          </button>
        )}
      </div>
    );
  }

  const liked = !!activeStyle.liked[productId];
  const canBuildOutfit = !!roleFor(product) && product.available;

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
          onClick={() => toggleDetailLike(product)}
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

          <div className="mt-1.5 text-[13px] text-neutral-700">
            {[product.color, product.fit, product.material].filter(Boolean).join(" · ")}
          </div>
          {product.available && product.sizes.length > 0 && (
            <div className="mt-1 text-[13px] text-neutral-700">
              Sizes {product.sizes.join(" · ")}
            </div>
          )}

          {canBuildOutfit && (
            <button
              onClick={() => onBuildOutfit(product.id)}
              className="mt-6 flex h-[54px] w-full items-center justify-between border border-neutral-400 px-5 text-[13px] font-semibold tracking-[0.1em] uppercase transition-colors hover:border-ink"
            >
              <span>Build outfit</span>
              <LayersIcon />
            </button>
          )}

          {product.available ? (
            <a
              href={product.shopUrl}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className={`${canBuildOutfit ? "mt-2.5" : "mt-6"} flex h-[54px] w-full items-center justify-between bg-ink px-5 text-[13px] font-semibold tracking-[0.1em] text-paper uppercase transition-colors hover:bg-neutral-800`}
            >
              <span>Shop at {product.retailer}</span>
              <ArrowUpRightIcon />
            </a>
          ) : (
            <div className="mt-6 flex h-[54px] w-full items-center justify-between border border-neutral-300 px-5 text-[13px] font-semibold tracking-[0.1em] text-neutral-500 uppercase">
              <span>No longer available</span>
            </div>
          )}

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

/** Other in-stock pieces from the same category (and gender) — catalogue-based, not personalized. */
function useMoreLikeThis(product: Product | undefined, styleGender: ShopperGender | undefined): Product[] {
  const { ingest } = useCatalog();
  const [more, setMore] = useState<{ forId: string; products: Product[] } | null>(null);
  const id = product?.id;
  const category = product?.category;
  const gender = product ? shopperGenderFor(product, styleGender) : undefined;

  useEffect(() => {
    if (!id || !category) return;
    const controller = new AbortController();
    fetchProducts({ categories: [category], gender, exclude: [id], limit: 3 }, controller.signal)
      .then(({ products }) => {
        ingest(products);
        setMore({ forId: id, products });
      })
      .catch(() => {
        // Optional section: on failure it simply doesn't render.
      });
    return () => controller.abort();
  }, [id, category, gender, ingest]);

  return more && more.forId === id ? more.products : [];
}

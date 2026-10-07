"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRightIcon,
  BookmarkIcon,
  ChevronLeftIcon,
  RefreshIcon,
} from "@/components/icons";
import { OutfitComposition } from "@/components/OutfitComposition";
import { SwapSheet } from "@/components/SwapSheet";
import { fetchProducts } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import {
  alternativesFor,
  categoriesForRole,
  generateOutfit,
  outfitItemList,
  outfitTotal,
  reasonForLook,
  ROLE_DISPLAY_ORDER as ROLE_ORDER,
  roleFor,
  shopperGenderFor,
  SLOT_SEQUENCE_BY_ANCHOR_ROLE,
} from "@/lib/outfits";
import { useCatalog, useProducts } from "@/lib/store/product-catalog";
import { useStyleProfile } from "@/lib/store/style-profile-context";
import type { OutfitItems, OutfitRole, Product } from "@/lib/types";

/** Candidates fetched per slot to compose and swap from. */
const CANDIDATES_PER_SLOT = 12;

/**
 * The outfit experience. With `initialItems` it shows that exact outfit (opened
 * from the Outfits feed or Saved); without, it builds one around the anchor
 * product ("Build outfit" from a product). Either way any piece can be swapped.
 */
export function OutfitPageClient({
  anchor,
  initialItems,
}: {
  anchor: Product;
  initialItems?: OutfitItems;
}) {
  const router = useRouter();
  const { effectiveAffinity, saveOutfit, state, activeStyle } = useStyleProfile();
  const catalog = useCatalog();
  const { ingest } = catalog;
  // A given outfit's pieces may not be cached yet (e.g. opened from Saved after a reload).
  useProducts(initialItems ? Object.values(initialItems).filter((id): id is string => !!id) : []);

  // Only a freshly built outfit plays the "Building your outfit" beat.
  const [minTimeElapsed, setMinTimeElapsed] = useState(!!initialItems);
  const [pool, setPool] = useState<Product[] | null>(null);
  const anchorRole = roleFor(anchor);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [items, setItems] = useState<OutfitItems | null>(initialItems ?? null);
  const [swapRole, setSwapRole] = useState<OutfitRole | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinTimeElapsed(true), 1700);
    return () => clearTimeout(timer);
  }, []);

  // Fetch candidates for every slot the anchor doesn't fill, matched to its gender.
  useEffect(() => {
    if (!anchorRole) return;
    const controller = new AbortController();
    Promise.all(
      SLOT_SEQUENCE_BY_ANCHOR_ROLE[anchorRole].map((role) =>
        fetchProducts(
          {
            categories: categoriesForRole(role),
            gender: shopperGenderFor(anchor, activeStyle.gender),
            exclude: [anchor.id],
            limit: CANDIDATES_PER_SLOT,
          },
          controller.signal,
        ),
      ),
    )
      .then((pages) => {
        const candidates = pages.flatMap((p) => p.products);
        ingest([anchor, ...candidates]);
        setPool(candidates);
        setItems((current) => current ?? generateOutfit(anchor, candidates, effectiveAffinity));
        setLoadError(false);
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setLoadError(true);
      });
    return () => controller.abort();
    // The outfit is composed once from the affinity at load time; later taste
    // changes don't reshuffle an outfit the user is looking at.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, anchorRole, ingest, attempt]);

  const phase = minTimeElapsed && items ? "result" : "building";
  const sameItems = (a: OutfitItems, b: OutfitItems) =>
    ROLE_ORDER.every((role) => (a[role] ?? null) === (b[role] ?? null));
  const alreadySaved =
    !!items &&
    state.savedOutfits.some((o) => o.styleId === activeStyle.id && sameItems(o.items, items));

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push("/outfits");
  }
  const lookup = (id: string) => (id === anchor.id ? anchor : catalog.get(id));
  const list = useMemo(
    () => (items ? outfitItemList(items, lookup) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, catalog.version],
  );
  const total = useMemo(() => outfitTotal(list), [list]);
  const reason = useMemo(
    () => reasonForLook(list.map((i) => i.product), effectiveAffinity),
    [list, effectiveAffinity],
  );
  const swapAlternatives = useMemo(
    () =>
      swapRole && items && pool
        ? alternativesFor(swapRole, items, anchor, pool, effectiveAffinity)
        : [],
    [swapRole, items, pool, anchor, effectiveAffinity],
  );

  function handleSwap(role: OutfitRole, productId: string) {
    setItems((prev) => ({ ...prev, [role]: productId }));
    setSaved(false);
    setSwapRole(null);
  }

  function handleSave() {
    if (!items || alreadySaved) return;
    saveOutfit(anchor.id, items);
    setSaved(true);
  }

  if (loadError || !anchorRole) {
    return (
      <div className="flex h-dvh flex-col justify-end bg-paper px-[30px] pb-[46px]">
        <div className="font-serif text-[34px] leading-[1.08]">
          {loadError ? (
            <>We couldn&rsquo;t<br />build this outfit.</>
          ) : (
            <>This piece can&rsquo;t<br />start an outfit yet.</>
          )}
        </div>
        <p className="mt-3.5 max-w-[30ch] text-[14px] leading-[1.6] text-neutral-700">
          {loadError
            ? "The product service didn’t respond. Check your connection and try again."
            : "Outfits are built around clothing and shoes for now."}
        </p>
        <div className="mt-[26px] flex gap-5">
          {loadError && (
            <button
              onClick={() => {
                setLoadError(false);
                setAttempt((a) => a + 1);
              }}
              className="text-[11px] font-semibold tracking-[0.16em] uppercase underline"
            >
              Try again
            </button>
          )}
          <button
            onClick={goBack}
            className="text-[11px] font-semibold tracking-[0.16em] uppercase underline"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  if (phase === "building") {
    return (
      <div className="flex h-dvh flex-col justify-end bg-paper px-[30px] pb-[46px]">
        <div className="animate-rise font-serif text-[34px] leading-[1.08]">
          Building
          <br />
          your outfit&hellip;
        </div>
        <div className="mt-[26px] flex flex-col gap-[9px]">
          <div className="animate-rise text-[13px] font-medium text-neutral-700 [animation-delay:0.1s]">
            Reading the anchor piece
          </div>
          <div className="animate-rise text-[13px] font-medium text-neutral-700 [animation-delay:0.55s]">
            Matching your style
          </div>
          <div className="animate-rise text-[13px] font-medium text-neutral-700 [animation-delay:1s]">
            Composing the outfit
          </div>
        </div>
        <div className="relative mt-[30px] h-[2px] overflow-hidden bg-neutral-300">
          <div className="animate-grow absolute inset-0 bg-ink [animation-duration:1.6s] [animation-timing-function:cubic-bezier(0.4,0.1,0.2,1)]" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-paper">
      <div className="flex h-[52px] flex-none items-center justify-between px-[18px] pl-4 [padding-top:env(safe-area-inset-top)]">
        <button
          onClick={goBack}
          className="flex items-center gap-[7px] px-1 py-2 text-[11px] font-semibold tracking-[0.1em] text-neutral-700 uppercase"
        >
          <ChevronLeftIcon />
          Back
        </button>
        <button
          onClick={handleSave}
          aria-label={saved || alreadySaved ? "Outfit saved" : "Save outfit"}
          className="flex h-11 w-11 items-center justify-center"
        >
          <BookmarkIcon filled={saved || alreadySaved} className={saved || alreadySaved ? "text-accent-700" : ""} />
        </button>
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto">
        <div className="animate-rise px-[22px] pb-10">
          <div className="text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
            STYLEAI built this outfit for you
          </div>
          <div className="mt-2 font-serif text-[30px] leading-[1.08]">
            Your outfit
          </div>

          <OutfitComposition
            products={list.map((i) => i.product)}
            className="mt-5 aspect-square w-full"
            priority
          />

          <div className="mt-1">
            {list.map(({ role, product }) => (
              <div
                key={role}
                className="flex items-center justify-between gap-3 border-b border-neutral-300 py-3.5"
              >
                <button
                  onClick={() => router.push(`/product/${product.id}`)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block text-[9px] font-semibold tracking-[0.1em] text-neutral-700 uppercase">
                    {product.brand}
                  </span>
                  <span className="mt-0.5 block truncate text-[15px] font-semibold">
                    {product.name}
                  </span>
                </button>
                <span className="flex-none text-[13px] font-medium text-neutral-700">
                  {formatPrice(product.price, product.currency)}
                </span>
                <button
                  onClick={() => setSwapRole(role)}
                  className="flex flex-none items-center gap-[5px] text-[10px] font-semibold tracking-[0.08em] text-neutral-700 uppercase transition-colors hover:text-ink"
                >
                  <RefreshIcon />
                  Swap
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between py-4">
            <span className="text-[13px] font-medium text-neutral-700">Total</span>
            <span className="text-[19px] font-semibold">
              {formatPrice(total, "SEK")}
            </span>
          </div>

          <button className="flex h-[54px] w-full items-center justify-between bg-ink px-5 text-[13px] font-semibold tracking-[0.1em] text-paper uppercase transition-colors hover:bg-neutral-800">
            <span>Shop outfit</span>
            <ArrowUpRightIcon />
          </button>

          <div className="mt-[30px] border-t border-neutral-300 pt-[18px]">
            <div className="text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
              Why this outfit
            </div>
            <div className="mt-[11px] text-[15px] leading-[1.6] font-medium text-pretty">
              {reason}
            </div>
          </div>
        </div>
      </div>

      {swapRole && (
        <SwapSheet
          role={swapRole}
          alternatives={swapAlternatives}
          onPick={(product) => handleSwap(swapRole, product.id)}
          onClose={() => setSwapRole(null)}
        />
      )}
    </div>
  );
}

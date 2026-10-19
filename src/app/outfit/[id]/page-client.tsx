"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpRightIcon,
  BookmarkIcon,
  ChevronLeftIcon,
  RefreshIcon,
} from "@/components/icons";
import { OutfitComposition } from "@/components/OutfitComposition";
import { SwapSheet, type SwapAlternative, type SwapStatus } from "@/components/SwapSheet";
import { fetchProducts } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import {
  alternativesFor,
  categoriesForRole,
  generateOutfit,
  outfitHref,
  outfitItemList,
  outfitTotal,
  parseOutfitItems,
  pieceLabel,
  reasonForLook,
  replacePiece,
  ROLE_DISPLAY_ORDER as ROLE_ORDER,
  roleFor,
  shopperGenderFor,
} from "@/lib/outfits";
import { useCatalog, useProducts } from "@/lib/store/product-catalog";
import { useStyleProfile } from "@/lib/store/style-profile-context";
import type { OutfitItems, OutfitRole, Product } from "@/lib/types";

/** Candidates fetched per slot and page (the product API's maximum); Swap pages further on demand. */
const CANDIDATES_PER_PAGE = 50;
/** Alternatives shown per Swap batch. */
const SWAP_BATCH = 3;
/** How long a swap stays highlighted and can be undone. */
const UNDO_MS = 5000;

interface SwapSession {
  /** Distinguishes sheet openings, so a late response can't land in a newer one. */
  id: number;
  role: OutfitRole;
  /** The piece being replaced. */
  current: Product;
  label: string;
  alternatives: SwapAlternative[];
  status: SwapStatus;
  hasMore: boolean;
}

/**
 * The outfit experience. With `initialItems` it shows that exact outfit (opened
 * from the Outfits feed or Saved); without, it builds one around the anchor
 * product ("Build outfit" from a product). Either way any piece — the anchor
 * included — can be swapped. `anchor` stays the piece the outfit started from,
 * even once it has been swapped out.
 */
export function OutfitPageClient({
  anchor,
  initialItems,
}: {
  anchor: Product;
  initialItems?: OutfitItems;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { effectiveAffinity, saveOutfit, state, activeStyle } = useStyleProfile();
  const catalog = useCatalog();
  const { ingest } = catalog;
  // Swaps are written to the URL without a server round trip, so the URL can
  // be newer than the server-rendered props (e.g. when history restores this page).
  const [startItems] = useState(() => parseOutfitItems(searchParams.get("items")) ?? initialItems);
  // A given outfit's pieces may not be cached yet (e.g. opened from Saved after a reload).
  useProducts(startItems ? Object.values(startItems).filter((id): id is string => !!id) : []);

  // Only a freshly built outfit plays the "Building your outfit" beat.
  const [minTimeElapsed, setMinTimeElapsed] = useState(!!startItems);
  const [pool, setPool] = useState<Product[] | null>(null);
  const anchorRole = roleFor(anchor);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [items, setItems] = useState<OutfitItems | null>(startItems ?? null);
  const [swap, setSwap] = useState<SwapSession | null>(null);
  const [saved, setSaved] = useState(false);
  /** Where each slot's listing continues; null once it is exhausted. */
  const cursors = useRef<Partial<Record<OutfitRole, string | null>>>({});
  /** Pieces swapped out of each slot while this page is open — not offered for that slot again. */
  const replaced = useRef<Partial<Record<OutfitRole, string[]>>>({});
  const swapSeq = useRef(0);
  /** The most recent swap, while it can still be undone. */
  const [lastSwap, setLastSwap] = useState<{ role: OutfitRole; previous: string; next: string; label: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(undoTimer.current), []);

  useEffect(() => {
    const timer = setTimeout(() => setMinTimeElapsed(true), 1700);
    return () => clearTimeout(timer);
  }, []);

  const gender = shopperGenderFor(anchor, activeStyle.gender);
  const fetchSlot = (role: OutfitRole, cursor?: string, signal?: AbortSignal) =>
    fetchProducts({ categories: categoriesForRole(role), gender, cursor, limit: CANDIDATES_PER_PAGE }, signal);

  // Fetch candidates for every slot, the anchor's too (so it can be swapped), matched to its gender.
  useEffect(() => {
    if (!anchorRole) return;
    const controller = new AbortController();
    Promise.all(ROLE_ORDER.map((role) => fetchSlot(role, undefined, controller.signal)))
      .then((pages) => {
        cursors.current = Object.fromEntries(ROLE_ORDER.map((role, i) => [role, pages[i].nextCursor]));
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

  /**
   * Appends the next batch of alternatives to an open Swap sheet. When the
   * loaded pool can't fill a batch with good matches and the slot has more
   * pages, one more page is fetched first — at most one per request.
   */
  async function reveal(session: number, role: OutfitRole, shown: SwapAlternative[]) {
    if (!items || !pool) return;
    const update = (fn: (s: SwapSession) => SwapSession) =>
      setSwap((s) => (s && s.id === session ? fn(s) : s));
    const next = (candidates: Product[]) =>
      alternativesFor(role, items, anchor, candidates, effectiveAffinity, {
        lookup,
        seen: [...(replaced.current[role] ?? []), ...shown.map((a) => a.product.id)],
        disliked: activeStyle.disliked,
        count: SWAP_BATCH,
      });

    let batch = next(pool);
    const cursor = cursors.current[role];
    if (cursor && (!batch.suitable || batch.products.length < SWAP_BATCH)) {
      update((s) => ({ ...s, status: "loading" }));
      try {
        const page = await fetchSlot(role, cursor);
        cursors.current[role] = page.nextCursor;
        ingest(page.products);
        setPool((p) => [...(p ?? []), ...page.products]);
        batch = next([...pool, ...page.products]);
      } catch {
        update((s) => ({ ...s, status: "error" }));
        return;
      }
    }
    update((s) => ({
      ...s,
      alternatives: [...shown, ...batch.products.map((product) => ({ product, suitable: batch.suitable }))],
      status: "ready",
      hasMore: batch.more || !!cursors.current[role],
    }));
  }

  function openSwap(role: OutfitRole, product: Product) {
    const id = ++swapSeq.current;
    setSwap({ id, role, current: product, label: pieceLabel(product), alternatives: [], status: "loading", hasMore: false });
    void reveal(id, role, []);
  }

  /** Shows the outfit and keeps it in the URL, so a refresh or a return to this page shows it. */
  function applyItems(next: OutfitItems) {
    setItems(next);
    setSaved(false);
    // Replacing (not pushing) keeps Back going to where the user came from.
    window.history.replaceState(null, "", outfitHref(anchor.id, next));
  }

  function handleSwap(role: OutfitRole, product: Product) {
    const previous = items?.[role];
    if (!items || !previous || previous === product.id) return;
    replaced.current[role] = [...(replaced.current[role] ?? []), previous];
    applyItems(replacePiece(items, role, product.id));
    setSwap(null);
    setLastSwap({ role, previous, next: product.id, label: pieceLabel(product) });
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setLastSwap(null), UNDO_MS);
  }

  /** Puts the swapped-out piece back; the one it replaced isn't offered again for the slot. */
  function handleUndo() {
    if (!items || !lastSwap || items[lastSwap.role] !== lastSwap.next) return;
    const { role, previous, next } = lastSwap;
    replaced.current[role] = [...(replaced.current[role] ?? []).filter((id) => id !== previous), next];
    applyItems(replacePiece(items, role, previous));
    setLastSwap(null);
    clearTimeout(undoTimer.current);
  }

  const roleOf = (product: Product) => list.find((i) => i.product.id === product.id)?.role;

  function handleSave() {
    if (!items || saved || alreadySaved) return;
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
            Built for you
          </div>
          <div className="mt-2 font-serif text-[30px] leading-[1.08]">
            Your outfit
          </div>

          <OutfitComposition
            products={list.map((i) => i.product)}
            className="mt-5 aspect-square w-full"
            priority
            controls={{
              onOpen: (product) => router.push(`/product/${product.id}`),
              onSwap: (product) => {
                const role = roleOf(product);
                if (role) openSwap(role, product);
              },
              swapDisabled: !pool,
              highlightId: lastSwap?.next,
            }}
          />
          <div className="mt-2.5 flex items-center gap-[5px] text-[12px] text-neutral-700">
            Tap a photo for details ·
            <RefreshIcon className="h-[13px] w-[13px] text-ink" />
            to swap that piece
          </div>

          <div className="mt-1.5">
            {list.map(({ role, product }) => (
              <button
                key={role}
                onClick={() => router.push(`/product/${product.id}`)}
                className="flex w-full items-center gap-3 border-b border-neutral-300 py-2.5 text-left"
              >
                <div className="relative h-[46px] w-10 flex-none overflow-hidden bg-neutral-200">
                  <Image src={product.image} alt="" fill sizes="40px" className="object-cover" />
                </div>
                <span className="min-w-0 flex-1">
                  <span className="block text-[9px] font-semibold tracking-[0.1em] text-neutral-700 uppercase">
                    {product.brand} · {pieceLabel(product)}
                  </span>
                  <span className="mt-0.5 block truncate text-[15px] font-semibold">
                    {product.name}
                  </span>
                </span>
                <span className="flex-none text-[13px] font-medium text-neutral-700">
                  {formatPrice(product.price, product.currency)}
                </span>
              </button>
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

      {swap && (
        <SwapSheet
          key={swap.id}
          current={swap.current}
          label={swap.label}
          alternatives={swap.alternatives}
          status={swap.status}
          hasMore={swap.hasMore}
          onMore={() => void reveal(swap.id, swap.role, swap.alternatives)}
          onRetry={() => void reveal(swap.id, swap.role, swap.alternatives)}
          onPick={(product) => handleSwap(swap.role, product)}
          onClose={() => setSwap(null)}
        />
      )}

      {lastSwap && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-[calc(28px+env(safe-area-inset-bottom))] z-30 mx-auto flex h-14 max-w-[448px] items-center justify-between bg-ink pr-1.5 pl-[18px] text-paper"
        >
          <span className="text-[13px] font-medium">
            <span className="capitalize">{lastSwap.label}</span> swapped
          </span>
          <button
            onClick={handleUndo}
            className="h-11 px-3.5 text-[11px] font-semibold tracking-[0.16em] uppercase underline"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

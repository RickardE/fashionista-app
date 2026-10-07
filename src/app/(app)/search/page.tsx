"use client";

import { useEffect, useState } from "react";
import { CloseIcon, SearchIcon } from "@/components/icons";
import { ProductTile } from "@/components/ProductTile";
import { TopBar } from "@/components/TopBar";
import { searchProducts } from "@/lib/api";
import { RECENT_SEARCHES, SUGGESTED_SEARCHES } from "@/lib/data/search";
import { useCatalog } from "@/lib/store/product-catalog";
import { useStyleProfile } from "@/lib/store/style-profile-context";
import type { Product } from "@/lib/types";

type SearchResult =
  | { status: "loading" }
  | { status: "done"; products: Product[] }
  | { status: "error" };

/** A response tagged with the request it answers, so stale ones read as "loading". */
type Tagged = { key: string; result: SearchResult };

const RESULT_LIMIT = 20;

export default function SearchPage() {
  const { ingest } = useCatalog();
  const gender = useStyleProfile().activeStyle.gender;
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<Tagged | null>(null);
  const requestKey = `${submitted}\u0000${gender}\u0000${attempt}`;
  const result: SearchResult =
    response?.key === requestKey ? response.result : { status: "loading" };

  function run(q: string) {
    setQuery(q);
    setSubmitted(q);
  }

  useEffect(() => {
    if (!submitted) return;
    const controller = new AbortController();
    const key = `${submitted}\u0000${gender}\u0000${attempt}`;
    searchProducts(submitted, gender, RESULT_LIMIT, controller.signal)
      .then(({ products }) => {
        ingest(products);
        setResponse({ key, result: { status: "done", products } });
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setResponse({ key, result: { status: "error" } });
      });
    return () => controller.abort();
  }, [submitted, gender, attempt, ingest]);

  return (
    <>
      <TopBar title="Search" />
      <main className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div className="px-[22px] pt-1.5">
          <div className="flex items-center gap-2.5 border-b-2 border-ink pb-2.5">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && query.trim()) run(query.trim());
              }}
              placeholder="What are you looking for?"
              className="flex-1 border-0 bg-transparent text-[15px] outline-none"
            />
            {!!query && (
              <button
                onClick={() => {
                  setQuery("");
                  setSubmitted("");
                }}
                className="flex text-neutral-700"
                aria-label="Clear search"
              >
                <CloseIcon />
              </button>
            )}
          </div>
        </div>

        {!submitted ? (
          <div className="px-[22px] pt-[26px] pb-10">
            <div className="mb-1.5 text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
              Recent
            </div>
            {RECENT_SEARCHES.map((q) => (
              <button
                key={q}
                onClick={() => run(q)}
                className="flex w-full items-center justify-between border-b border-neutral-300 py-[13px] transition-colors hover:text-accent-700"
              >
                <span className="text-[15px]">{q}</span>
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M7 17 17 7M9 7h8v8" />
                </svg>
              </button>
            ))}
            <div className="mt-7 mb-3 text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
              Suggested for you
            </div>
            <div className="flex flex-wrap gap-[7px]">
              {SUGGESTED_SEARCHES.map((q) => (
                <button
                  key={q}
                  onClick={() => run(q)}
                  className="border border-neutral-400 px-[13px] py-[9px] text-[13px] font-medium whitespace-nowrap transition-colors hover:border-ink"
                >
                  {q}
                </button>
              ))}
            </div>
            <p className="mt-8 max-w-[30ch] text-[13px] leading-[1.6] text-neutral-700">
              Search when you know what you&rsquo;re looking for.
            </p>
          </div>
        ) : (
          <div className="animate-rise px-[22px] pt-5 pb-10">
            <div className="border-b border-neutral-300 pb-3 text-[19px] leading-[1.2] font-semibold">
              &ldquo;{submitted}&rdquo;
            </div>
            {result.status === "done" && result.products.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-5">
                {result.products.map((product) => (
                  <ProductTile key={product.id} product={product} compact />
                ))}
              </div>
            )}
            {result.status === "done" && result.products.length === 0 && (
              <p className="mt-4 max-w-[30ch] text-[14px] leading-[1.6] text-neutral-700">
                Nothing matches that yet. Try a broader word — a colour, a piece or a brand.
              </p>
            )}
            {result.status === "loading" && (
              <p className="mt-4 text-[13px] text-neutral-700">Searching&hellip;</p>
            )}
            {result.status === "error" && (
              <p className="mt-4 text-[14px] leading-[1.6] text-neutral-700">
                Search isn&rsquo;t responding right now.{" "}
                <button onClick={() => setAttempt((a) => a + 1)} className="font-semibold underline">
                  Try again
                </button>
              </p>
            )}
          </div>
        )}
      </main>
    </>
  );
}

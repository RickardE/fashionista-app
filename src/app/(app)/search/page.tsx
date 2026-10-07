"use client";

import { useState } from "react";
import { CloseIcon, SearchIcon } from "@/components/icons";
import { ProductTile } from "@/components/ProductTile";
import { TopBar } from "@/components/TopBar";
import { PRODUCTS_BY_ID, RECENT_SEARCHES, SUGGESTED_SEARCHES } from "@/lib/data/products";
import { rankedIds } from "@/lib/personalization";
import { useStyleProfile } from "@/lib/store/style-profile-context";

export default function SearchPage() {
  const { effectiveAffinity } = useStyleProfile();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");

  function run(q: string) {
    setQuery(q);
    setSubmitted(q);
  }

  const results = rankedIds(effectiveAffinity)
    .slice(0, 6)
    .map((id) => PRODUCTS_BY_ID[id]);

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
            <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-5">
              {results.map((product) => (
                <ProductTile key={product.id} product={product} compact />
              ))}
            </div>
          </div>
        )}
      </main>
    </>
  );
}

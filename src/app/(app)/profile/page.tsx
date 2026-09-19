"use client";

import { useRouter } from "next/navigation";
import { ChevronRightIcon, PlusIcon } from "@/components/icons";
import { TopBar } from "@/components/TopBar";
import { useStyleProfile } from "@/lib/store/style-profile-context";

export default function ProfilePage() {
  const router = useRouter();
  const { styles, activeStyle, restart } = useStyleProfile();

  function resetPrototype() {
    restart();
    router.push("/");
  }

  return (
    <>
      <TopBar title="Your Styles" meta={`${styles.length} styles`} />
      <main className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div className="px-[22px] pt-1.5 pb-12">
          <div className="h-[2px] bg-divider" />

          <div className="mt-6 mb-1 text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
            My styles
          </div>
          {styles.map((s) => (
            <button
              key={s.id}
              onClick={() => router.push(`/style/${s.id}`)}
              className="flex w-full items-center justify-between border-b border-neutral-300 py-[14px] text-left"
            >
              <span>
                <span className="flex items-center gap-2">
                  <span className="text-[16px] font-semibold">{s.name}</span>
                  {s.id === activeStyle.id && (
                    <span className="text-[9px] font-semibold tracking-[0.1em] text-accent-700 uppercase">
                      Active
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-[12px] text-neutral-700">
                  {s.description}
                </span>
              </span>
              <ChevronRightIcon />
            </button>
          ))}
          <button
            onClick={() => router.push("/style/new")}
            className="flex w-full items-center gap-2 border-b border-neutral-300 py-[14px] text-[15px] font-medium text-neutral-700"
          >
            <PlusIcon />
            Create new style
          </button>

          <div className="mt-[30px] mb-1 text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
            Preferences
          </div>
          <button
            onClick={() => router.push("/onboarding/upload")}
            className="flex w-full items-center justify-between border-b border-neutral-300 py-[14px]"
          >
            <span className="text-[15px] font-medium">Add inspiration</span>
            <ChevronRightIcon />
          </button>
          <div className="flex items-center justify-between border-b border-neutral-300 py-[14px]">
            <span className="text-[15px] font-medium">Sizes</span>
            <span className="text-[13px] text-neutral-700">M · 32 · 43</span>
          </div>
          <div className="flex items-center justify-between border-b border-neutral-300 py-[14px]">
            <span className="text-[15px] font-medium">Price range</span>
            <span className="text-[13px] text-neutral-700">
              900 – 4 000 SEK
            </span>
          </div>
          <div className="flex items-center justify-between border-b border-neutral-300 py-[14px]">
            <span className="text-[15px] font-medium">Brands you follow</span>
            <span className="text-[13px] text-neutral-700">7</span>
          </div>

          <div className="mt-12 flex justify-center">
            <button
              onClick={resetPrototype}
              className="text-[11px] font-medium text-neutral-500 underline underline-offset-2"
            >
              Reset this prototype
            </button>
          </div>
        </div>
      </main>
    </>
  );
}

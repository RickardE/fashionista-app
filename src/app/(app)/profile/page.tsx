"use client";

import { useRouter } from "next/navigation";
import { ChevronRightIcon, PlusIcon } from "@/components/icons";
import { StyleAvatar } from "@/components/StyleAvatar";
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
      <TopBar title="Your Styles" />
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
              className="flex w-full items-center gap-3.5 border-b border-neutral-300 py-[15px] text-left"
            >
              <StyleAvatar style={s} size={40} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-[17px] font-semibold">{s.name}</span>
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
            className="flex w-full items-center gap-2 border-b border-neutral-300 py-[15px] text-[15px] font-medium text-neutral-700"
          >
            <PlusIcon />
            Create new style
          </button>

          <div className="mt-10 mb-0.5 text-[10px] font-semibold tracking-[0.12em] text-neutral-500 uppercase">
            Preferences
          </div>
          <button
            onClick={() => router.push("/onboarding/upload")}
            className="flex w-full items-center justify-between py-[11px] text-neutral-700"
          >
            <span className="text-[14px]">Add inspiration</span>
            <ChevronRightIcon />
          </button>
          <div className="flex items-center justify-between py-[11px] text-neutral-700">
            <span className="text-[14px]">Sizes</span>
            <span className="text-[13px]">M · 32 · 43</span>
          </div>
          <div className="flex items-center justify-between py-[11px] text-neutral-700">
            <span className="text-[14px]">Price range</span>
            <span className="text-[13px]">900 – 4 000 SEK</span>
          </div>
          <div className="flex items-center justify-between py-[11px] text-neutral-700">
            <span className="text-[14px]">Brands you follow</span>
            <span className="text-[13px]">7</span>
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

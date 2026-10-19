"use client";

/**
 * A one-time tip over the top of a feed. `pointer` adds a notch towards the
 * top bar's right side, for tips about the style switcher.
 */
export function TipBanner({
  children,
  onDismiss,
  pointer = false,
}: {
  children: React.ReactNode;
  onDismiss: () => void;
  pointer?: boolean;
}) {
  return (
    <div role="status" className="animate-rise absolute top-3 right-[22px] left-[22px] z-10 bg-ink text-paper">
      {pointer && <span aria-hidden className="absolute -top-1.5 right-10 h-3 w-3 rotate-45 bg-ink" />}
      <div className="relative flex items-start gap-4 px-4 py-3.5">
        <p className="flex-1 text-[13px] leading-[1.5]">{children}</p>
        <button
          onClick={onDismiss}
          className="flex-none pt-[3px] text-[10px] font-semibold tracking-[0.1em] uppercase underline underline-offset-2"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

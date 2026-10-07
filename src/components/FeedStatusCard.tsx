import { ChevronRightIcon } from "@/components/icons";

/** Full-card message in the feed (end of feed, loading, error), in the deck's own type. */
export function FeedStatusCard({
  kicker,
  title,
  body,
  action,
  behind = false,
}: {
  behind?: boolean;
  kicker: string;
  title: React.ReactNode;
  body?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div
      className="absolute inset-0 flex h-full w-full flex-col justify-center bg-paper px-[22px]"
      style={{
        transform: behind ? "scale(0.94) translateY(14px)" : undefined,
        opacity: behind ? 0.92 : 1,
        pointerEvents: behind ? "none" : undefined,
      }}
      aria-hidden={behind}
    >
      <div className="text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
        {kicker}
      </div>
      <div className="mt-4 font-serif text-[34px] leading-[1.08]">{title}</div>
      {body && (
        <p className="mt-3.5 max-w-[28ch] text-[14px] leading-[1.6] text-neutral-700">
          {body}
        </p>
      )}
      {action && (
        <>
          <div className="mt-[26px] mb-[22px] h-[2px] bg-divider" />
          <button
            onClick={action.onClick}
            className="flex h-[52px] items-center justify-between border border-neutral-400 px-5 text-[13px] font-semibold tracking-[0.1em] uppercase transition-colors hover:border-ink"
          >
            <span>{action.label}</span>
            <ChevronRightIcon />
          </button>
        </>
      )}
    </div>
  );
}

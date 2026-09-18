export function Kicker({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase ${className}`}
    >
      {children}
    </div>
  );
}

export function Divider({ className = "" }: { className?: string }) {
  return <div className={`h-[2px] bg-divider ${className}`} />;
}

export function Hairline({ className = "" }: { className?: string }) {
  return <div className={`h-px bg-neutral-300 ${className}`} />;
}

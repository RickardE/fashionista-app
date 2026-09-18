import type { ButtonHTMLAttributes } from "react";
import { ArrowRightIcon } from "@/components/icons";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: React.ReactNode;
};

export function PrimaryButton({
  children,
  className = "",
  icon,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={`flex h-[54px] w-full items-center justify-between bg-ink px-5 text-[12px] font-semibold tracking-[0.16em] text-paper uppercase transition-colors hover:bg-neutral-800 disabled:opacity-40 ${className}`}
    >
      <span>{children}</span>
      {icon ?? <ArrowRightIcon />}
    </button>
  );
}

export function SecondaryButton({
  children,
  className = "",
  icon,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={`flex h-[54px] w-full items-center justify-between border border-neutral-400 px-5 text-[12px] font-semibold tracking-[0.16em] uppercase transition-colors hover:border-ink disabled:opacity-40 ${className}`}
    >
      <span>{children}</span>
      {icon ?? <ArrowRightIcon />}
    </button>
  );
}

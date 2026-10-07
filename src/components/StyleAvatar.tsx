import type { StyleProfile } from "@/lib/types";

/** Muted, paper-friendly tints. Built-in styles get a fixed one; custom styles hash into the list. */
const TINTS = ["#ddd3c4", "#cdd2d6", "#e3cbbb", "#cfd4c6", "#d9cfd6", "#d6d0bf"];
const BUILTIN_TINT: Record<string, string> = {
  everyday: TINTS[0],
  work: TINTS[1],
  vacation: TINTS[2],
};

function tintFor(id: string): string {
  if (BUILTIN_TINT[id]) return BUILTIN_TINT[id];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return TINTS[Math.abs(hash) % TINTS.length];
}

/** A style's monogram — gives each style a recognisable, profile-like identity. */
export function StyleAvatar({
  style,
  size = 24,
}: {
  style: Pick<StyleProfile, "id" | "name">;
  size?: number;
}) {
  return (
    <span
      aria-hidden
      className="inline-flex flex-none items-center justify-center font-serif leading-none text-ink"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.58),
        backgroundColor: tintFor(style.id),
      }}
    >
      {style.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

import { Lock } from "lucide-react";

/** Amber locked-item accent — matches inventory / compare lock chrome. */
export const LOCK_NEON = "#FBBF24";

/**
 * Minimalist Lucide padlock with neon glow — replaces legacy 🔒 emoji glyphs.
 * Center in a flex/grid parent (`items-center justify-center`) for badge slots.
 */
export default function NeonLockIcon({
  className = "w-3.5 h-3.5",
  color = LOCK_NEON,
  glow = true,
  style,
  ...rest
}) {
  const filter = glow
    ? `drop-shadow(0 0 3px ${color}) drop-shadow(0 0 7px ${color}99)`
    : undefined;
  return (
    <Lock
      className={`shrink-0 block ${className}`.trim()}
      style={{
        color,
        filter,
        ...style,
      }}
      aria-hidden
      {...rest}
    />
  );
}

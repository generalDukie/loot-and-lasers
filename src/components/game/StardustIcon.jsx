import { Sparkles } from "lucide-react";
import { STARDUST_COLOR, STARDUST_GLYPH } from "@/lib/gameData";

/** Re-exported for convenience so components only need one import path. */
export { STARDUST_GLYPH };

const NEON_GLOW = `drop-shadow(0 0 3px ${STARDUST_COLOR}) drop-shadow(0 0 8px ${STARDUST_COLOR}aa)`;

/**
 * Purple neon stardust mark — replaces legacy ✨ currency glyphs in UI.
 */
export default function StardustIcon({ className = "w-3.5 h-3.5", style, glow = true, ...rest }) {
  return (
    <Sparkles
      className={`shrink-0 ${className}`.trim()}
      style={{
        color: STARDUST_COLOR,
        filter: glow ? NEON_GLOW : undefined,
        ...style,
      }}
      aria-hidden
      {...rest}
    />
  );
}

/** Inline amount with neon icon — e.g. costs, rewards, balances. */
export function StardustAmount({
  value,
  className = "",
  iconClassName = "w-3 h-3",
  prefix = "",
  suffix = "",
  glow = true,
}) {
  const display = typeof value === "number" ? value.toLocaleString() : value;
  return (
    <span
      className={`inline-flex items-center gap-0.5 tabular-nums ${className}`.trim()}
      style={{ color: STARDUST_COLOR }}
    >
      {prefix}
      <StardustIcon className={iconClassName} glow={glow} />
      <span className="font-display font-bold leading-none">{display}</span>
      {suffix}
    </span>
  );
}

/** Format for toast / notification strings. */
export function formatStardust(amount) {
  const n = Number(amount) || 0;
  return `${n.toLocaleString()} ${STARDUST_GLYPH}`;
}

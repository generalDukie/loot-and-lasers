import { STAT_ICON_SRC } from "@/lib/statIcons";

/**
 * Attribute badge icon — Strength / Agility / Intellect / Luck / Vitality.
 * Scales to the container; keep aspect ratio via object-contain.
 */
export default function StatIcon({
  stat,
  className = "w-4 h-4",
  alt = "",
  ...rest
}) {
  const src = STAT_ICON_SRC[stat];
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt || ""}
      draggable={false}
      aria-hidden={alt ? undefined : true}
      className={`inline-block object-contain shrink-0 select-none align-middle ${className}`.trim()}
      {...rest}
    />
  );
}

/** Icon + trailing content in one inline flex row (chips, buff labels, gear deltas). */
export function StatIconLabel({
  stat,
  children,
  className = "",
  iconClassName = "w-3 h-3",
}) {
  if (stat === "all" || !STAT_ICON_SRC[stat]) {
    return <span className={className}>{children}</span>;
  }
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`.trim()}>
      <StatIcon stat={stat} className={iconClassName} />
      {children}
    </span>
  );
}

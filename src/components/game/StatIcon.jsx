import { STAT_ICON_SRC } from "@/lib/statIcons";
import { ATTR_STAT_KEYS, getStatColor } from "@/lib/gameData";

/**
 * Scoped presentation sizes for attribute badges.
 * - itemPane: ≥2× former gear-pane chips (was ~10px icon / 10px text)
 * - tooltip: ≥2× former compare-row chips (was ~12px icon / 11px text)
 * - tooltipEquipped: ≥2× equipped summary chips in the bubble
 * - heroAttributeButton: ~3× former StatBar hero icon (was 24px)
 */
export const STAT_PRESENTATION = {
  itemPane: {
    icon: "w-5 h-5",
    value: "text-[20px] font-display font-bold tabular-nums leading-none",
    gap: "gap-1",
    wrap: "flex flex-wrap items-center gap-x-2.5 gap-y-1",
  },
  tooltip: {
    icon: "w-6 h-6",
    value: "text-[22px] font-display font-bold tabular-nums leading-none",
    gap: "gap-1.5",
    label: "text-[13px] tracking-wide",
    wrap: "space-y-1.5",
  },
  tooltipEquipped: {
    icon: "w-5 h-5",
    value: "text-[20px] font-display font-bold tabular-nums leading-none",
    gap: "gap-1",
    wrap: "flex flex-wrap gap-x-3 gap-y-1 mt-1",
  },
  heroAttributeButton: {
    icon: "w-[4.5rem] h-[4.5rem]",
    well: "w-[4.75rem] h-[4.75rem] rounded-lg flex items-center justify-center shrink-0",
  },
};

/**
 * Attribute badge icon — Strength / Agility / Intellect / Luck / Vitality.
 * Scales to the container; keep aspect ratio via object-contain.
 */
export default function StatIcon({
  stat,
  presentation,
  className,
  alt = "",
  ...rest
}) {
  const src = STAT_ICON_SRC[stat];
  if (!src) return null;
  const fromPresentation = presentation && STAT_PRESENTATION[presentation]?.icon;
  const resolvedClass = className || fromPresentation || "w-4 h-4";
  return (
    <img
      src={src}
      alt={alt || ""}
      draggable={false}
      aria-hidden={alt ? undefined : true}
      className={`inline-block object-contain shrink-0 select-none align-middle ${resolvedClass}`.trim()}
      {...rest}
    />
  );
}

/** Icon + trailing content in one inline flex row (chips, buff labels, gear deltas). */
export function StatIconLabel({
  stat,
  children,
  presentation = "itemPane",
  className = "",
  iconClassName,
  valueClassName,
  ...rest
}) {
  const preset = STAT_PRESENTATION[presentation] || STAT_PRESENTATION.itemPane;
  if (stat === "all" || !STAT_ICON_SRC[stat]) {
    return <span className={className} {...rest}>{children}</span>;
  }
  return (
    <span className={`inline-flex items-center ${preset.gap || "gap-0.5"} ${className}`.trim()} {...rest}>
      <StatIcon
        stat={stat}
        presentation={presentation}
        className={iconClassName || preset.icon}
      />
      {valueClassName ? <span className={valueClassName}>{children}</span> : children}
    </span>
  );
}

/**
 * Shared gear-attribute chip row used by item panes (EquipmentSlots, shop,
 * rewards, ItemCard, CompactItemRow, inventory tiles).
 * Preserves entry order; only positive rolled stats are shown.
 */
export function GearAttributeChips({
  stats,
  presentation = "itemPane",
  className = "",
  max,
  prefix = "+",
  colorize = true,
}) {
  if (!stats || typeof stats !== "object") return null;
  const preset = STAT_PRESENTATION[presentation] || STAT_PRESENTATION.itemPane;
  const order = ATTR_STAT_KEYS?.length
    ? ATTR_STAT_KEYS.filter((k) => (stats[k] || 0) > 0)
    : Object.keys(stats).filter((k) => (stats[k] || 0) > 0);
  const entries = order.length
    ? order.map((k) => [k, stats[k]])
    : Object.entries(stats).filter(([, v]) => v > 0);
  const shown = typeof max === "number" ? entries.slice(0, max) : entries;
  if (!shown.length) return null;
  return (
    <div className={`${preset.wrap} ${className}`.trim()}>
      {shown.map(([stat, val]) => (
        <StatIconLabel
          key={stat}
          stat={stat}
          presentation={presentation}
          valueClassName={preset.value}
          className="min-w-0"
        >
          <span style={colorize ? { color: getStatColor(stat) } : undefined}>
            {prefix}{val}
          </span>
        </StatIconLabel>
      ))}
    </div>
  );
}

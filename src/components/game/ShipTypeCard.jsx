import React from "react";
import { motion } from "framer-motion";
import { Check, Lock, Loader2, Gem } from "lucide-react";
import { getShipInherentLabel } from "@/lib/gameData";
import { ShipHullPreview, SHIP_HULL_THEME } from "@/components/game/ShipHangarHero";

export default function ShipTypeCard({
  ship,
  shipKey,
  owned,
  active,
  affordable,
  unlocked,
  unlockLevel,
  characterLevel = 1,
  onBuy,
  onActivate,
  buying,
  scoutMilestone,
}) {
  const inherent = getShipInherentLabel(ship);
  const theme = SHIP_HULL_THEME[shipKey] || SHIP_HULL_THEME.scout;
  const locked = !owned && !unlocked;
  const progress = locked && unlockLevel > 1
    ? Math.min(100, Math.round((characterLevel / unlockLevel) * 100))
    : 100;
  const levelsLeft = locked ? Math.max(0, unlockLevel - characterLevel) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-2xl border bg-card/35 backdrop-blur-sm p-4 flex flex-col transition-shadow hover:shadow-[0_10px_30px_rgba(0,0,0,0.28)] ${
        active ? "border-glow-cyan shadow-[0_0_24px_hsl(172_62%_46%/0.15)]" : locked ? "border-border/25" : "border-border/45"
      }`}
    >
      {/* Ghost bay preview for locked hulls */}
      {locked && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 70% 60% at 80% 40%, ${theme.glow}, transparent 65%)`,
            opacity: 0.55,
          }}
        />
      )}

      <div className="relative z-10 flex items-start gap-3 mb-2">
        <div
          className={`w-14 h-10 rounded-xl border flex items-center justify-center shrink-0 overflow-hidden ${
            locked ? "bg-black/40 border-white/10" : "bg-primary/10 border-primary/20"
          }`}
        >
          <ShipHullPreview
            shipId={shipKey}
            accent={theme.accent}
            ghost={locked}
            className="w-12 h-auto"
          />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className={`font-display font-semibold text-sm leading-tight ${locked ? "text-foreground/80" : "text-foreground"}`}>
            {ship.name}
          </h3>
          {inherent && (
            <span className="text-[10px] font-medium" style={{ color: locked ? `${theme.accent}99` : theme.accent }}>
              {locked ? `Teaser · ${inherent}` : inherent}
            </span>
          )}
          {shipKey === "scout" && scoutMilestone?.claimed && (
            <span className="block text-[9px] text-sky-300/90 font-medium mt-0.5">Bay tuned · free Fuel Tank T1</span>
          )}
          {shipKey === "scout" && scoutMilestone && !scoutMilestone.claimed && !scoutMilestone.eligible && (
            <span className="block text-[9px] text-muted-foreground mt-0.5">
              Scout tune at Lv {scoutMilestone.level} ({Math.max(0, scoutMilestone.level - characterLevel)} left)
            </span>
          )}
        </div>
        {active && (
          <span className="text-[10px] bg-primary/15 text-primary px-2 py-0.5 rounded-full font-display font-semibold shrink-0">ACTIVE</span>
        )}
        {locked && (
          <span className="text-[10px] bg-muted/50 text-muted-foreground px-2 py-0.5 rounded-full font-display font-semibold shrink-0 flex items-center gap-1">
            <Lock className="w-3 h-3" /> Lv {unlockLevel}
          </span>
        )}
      </div>

      <p className={`relative z-10 text-xs leading-relaxed mb-3 ${locked ? "text-muted-foreground/80" : "text-muted-foreground"}`}>
        {ship.desc}
      </p>

      {locked && (
        <div className="relative z-10 mb-3">
          <div className="flex justify-between text-[9px] text-muted-foreground mb-1">
            <span>Bay reserved</span>
            <span className="tabular-nums">{characterLevel} / {unlockLevel} · {levelsLeft} lvl left</span>
          </div>
          <div className="h-1.5 rounded-full bg-black/40 overflow-hidden border border-white/5">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${progress}%`, background: theme.accent }}
            />
          </div>
        </div>
      )}

      <div className="relative z-10 mt-auto">
        {owned ? (
          active ? (
            <div className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-primary/10 text-primary text-xs font-display font-semibold">
              <Check className="w-3.5 h-3.5" /> In Use
            </div>
          ) : (
            <button
              onClick={onActivate}
              disabled={buying}
              className="painted-btn w-full py-2.5 text-xs flex items-center justify-center gap-1.5"
            >
              {buying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Activate
            </button>
          )
        ) : locked ? (
          <div className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-dashed border-white/15 bg-black/25 text-muted-foreground text-xs font-medium">
            <Lock className="w-3.5 h-3.5" /> Preview only · unlocks at Lv {unlockLevel || 1}
          </div>
        ) : (
          <button
            onClick={onBuy}
            disabled={buying || !affordable}
            className="painted-btn painted-btn-accent w-full py-2.5 text-xs flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {buying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : affordable ? <Gem className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            {ship.cost.toLocaleString()}
          </button>
        )}
      </div>
    </motion.div>
  );
}

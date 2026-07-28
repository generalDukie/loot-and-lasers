import React from "react";
import { motion } from "framer-motion";
import { Check, Lock, Loader2, Sparkles } from "lucide-react";
import { getTierEffectLabel, getMaxTierTotal, getTierCost } from "@/lib/gameData";

const CAT_TINT = {
  Propulsion: "#38BDF8",
  Harvesting: "#C084FC",
  Computing: "#34D399",
  Storage: "#FBBF24",
};

export default function ShipModCard({ mod, progress, stardust, onBuy, buying, shipId, accent }) {
  const { installed, next, maxed } = progress;
  const nextCost = next ? getTierCost(next, shipId) : 0;
  const tint = accent || CAT_TINT[mod.category] || "#38BDF8";
  const pct = Math.round((installed / Math.max(1, mod.tiers.length)) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className="relative overflow-hidden rounded-2xl border bg-card/40 backdrop-blur-sm p-4 flex flex-col transition-shadow hover:shadow-[0_8px_28px_rgba(0,0,0,0.25)]"
      style={{ borderColor: `${tint}33` }}
    >
      <div
        className="absolute inset-0 pointer-events-none opacity-80"
        style={{ background: `radial-gradient(ellipse 80% 60% at 0% 0%, ${tint}18, transparent 55%)` }}
      />

      <div className="relative z-10 flex items-start gap-3 mb-2">
        <div
          className="w-11 h-11 rounded-xl border flex items-center justify-center text-2xl shrink-0"
          style={{ backgroundColor: `${tint}18`, borderColor: `${tint}40`, boxShadow: `0 0 14px ${tint}22` }}
        >
          {mod.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display font-semibold text-sm text-foreground leading-tight">{mod.name}</h3>
          <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: tint }}>{mod.category}</span>
        </div>
        <span
          className="text-[10px] font-mono font-bold shrink-0 px-1.5 py-0.5 rounded-md border tabular-nums"
          style={{ color: tint, borderColor: `${tint}44`, backgroundColor: `${tint}14` }}
        >
          T{installed}/{mod.tiers.length}
        </span>
      </div>

      <p className="relative z-10 text-xs text-muted-foreground leading-relaxed mb-3">{mod.desc}</p>

      <div className="relative z-10 mb-3">
        <div className="flex gap-1 mb-1.5">
          {mod.tiers.map((t, i) => (
            <div
              key={t.id}
              className="h-1.5 flex-1 rounded-full transition-colors"
              style={{ backgroundColor: i < installed ? tint : "rgba(255,255,255,0.08)" }}
            />
          ))}
        </div>
        <div className="h-0.5 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `${tint}66` }} />
        </div>
      </div>

      {maxed ? (
        <div
          className="relative z-10 mt-auto flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-display font-semibold tracking-wide border"
          style={{ color: tint, backgroundColor: `${tint}14`, borderColor: `${tint}40` }}
        >
          <Check className="w-3.5 h-3.5" /> MAX · {getMaxTierTotal(mod, shipId)}
        </div>
      ) : (
        <>
          <div className="relative z-10 mb-2 rounded-lg border border-white/5 bg-black/20 px-2.5 py-2">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">Next Tier</div>
            <div className="text-xs text-foreground font-medium leading-snug">{getTierEffectLabel(next, shipId)}</div>
            <div className="mt-1 text-[10px] text-muted-foreground/70">
              Cap: <span style={{ color: tint }} className="font-medium">{getMaxTierTotal(mod, shipId)}</span>
            </div>
          </div>
          <button
            onClick={onBuy}
            disabled={buying || stardust < nextCost}
            className="relative z-10 mt-auto painted-btn flex items-center justify-center gap-1.5 py-2.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {buying ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Installing…</>
            ) : stardust < nextCost ? (
              <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> {nextCost.toLocaleString()} <Sparkles className="w-3.5 h-3.5" /></span>
            ) : (
              <span className="flex items-center gap-1.5">Install · {nextCost.toLocaleString()} <Sparkles className="w-3.5 h-3.5" /></span>
            )}
          </button>
        </>
      )}
    </motion.div>
  );
}

import React from "react";
import { motion } from "framer-motion";
import { Check, Lock, Loader2, Sparkles } from "lucide-react";
import { getTierEffectLabel, getMaxTierTotal } from "@/lib/gameData";

export default function ShipModCard({ mod, progress, stardust, onBuy, buying, shipId }) {
  const { installed, next, maxed } = progress;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="painted-panel canvas-grain p-4 flex flex-col"
    >
      <div className="flex items-start gap-3 mb-2">
        <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-2xl shrink-0">
          {mod.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display font-semibold text-sm text-foreground leading-tight">{mod.name}</h3>
          <span className="text-[10px] uppercase tracking-wider text-primary/80">{mod.category}</span>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground shrink-0">T{installed}/{mod.tiers.length}</span>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed mb-3">{mod.desc}</p>

      {/* Tier dots */}
      <div className="flex gap-1.5 mb-3">
        {mod.tiers.map((t, i) => (
          <div
            key={t.id}
            className={`h-1.5 flex-1 rounded-full ${i < installed ? "bg-primary" : "bg-muted"}`}
          />
        ))}
      </div>

      {maxed ? (
        <div className="mt-auto flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-primary/10 text-primary text-xs font-display font-semibold tracking-wide">
          <Check className="w-3.5 h-3.5" /> MAX · {getMaxTierTotal(mod, shipId)}
        </div>
      ) : (
        <>
          <div className="mb-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Next Tier</div>
            <div className="text-xs text-foreground font-medium">{getTierEffectLabel(next, shipId)}</div>
          </div>
          <div className="mb-2 text-[10px] text-muted-foreground/70">
            Max Tier: <span className="text-primary/80 font-medium">{getMaxTierTotal(mod, shipId)}</span>
          </div>
          <button
            onClick={onBuy}
            disabled={buying || stardust < next.cost}
            className="mt-auto painted-btn flex items-center justify-center gap-1.5 py-2.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {buying ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Installing…</>
            ) : stardust < next.cost ? (
              <><Lock className="w-3.5 h-3.5" /> {next.cost} <Sparkles className="w-3.5 h-3.5" /></>
            ) : (
              <>Install · {next.cost} <Sparkles className="w-3.5 h-3.5" /></>
            )}
          </button>
        </>
      )}
    </motion.div>
  );
}
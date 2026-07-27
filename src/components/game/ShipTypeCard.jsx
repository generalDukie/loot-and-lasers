import React from "react";
import { motion } from "framer-motion";
import { Check, Lock, Loader2, Gem } from "lucide-react";
import { getShipInherentLabel } from "@/lib/gameData";

export default function ShipTypeCard({ ship, shipKey, owned, active, affordable, unlocked, unlockLevel, onBuy, onActivate, buying }) {
  const inherent = getShipInherentLabel(ship);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`painted-panel canvas-grain p-4 flex flex-col ${active ? "border-glow-cyan" : ""}`}
    >
      <div className="flex items-start gap-3 mb-2">
        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-3xl shrink-0">
          {ship.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display font-semibold text-sm text-foreground leading-tight">{ship.name}</h3>
          {inherent && <span className="text-[10px] text-primary/80 font-medium">{inherent}</span>}
        </div>
        {active && (
          <span className="text-[10px] bg-primary/15 text-primary px-2 py-0.5 rounded-full font-display font-semibold shrink-0">ACTIVE</span>
        )}
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed mb-3">{ship.desc}</p>

      <div className="mt-auto">
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
        ) : !unlocked ? (
          <div className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-muted/40 text-muted-foreground text-xs font-medium">
            <Lock className="w-3.5 h-3.5" /> Unlocks at Lv {unlockLevel || 1}
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
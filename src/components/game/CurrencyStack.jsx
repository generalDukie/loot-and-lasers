import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Fuel, Gem, Plus, Sparkles } from "lucide-react";
import { FUEL_COLOR, STARDUST_COLOR } from "@/lib/gameData";

// Vertical stack of compact currency pills (Fuel, Stardust, Crystals).
// Stretches to match the adjacent character portrait height; `large` scales
// the contents up for the hub header.
export default function CurrencyStack({ character, large = false }) {
  const fuel = character?.fuel ?? 0;
  const stardust = character?.stardust ?? 0;
  const crystals = character?.nova_crystals ?? 0;

  const ic = large ? "w-6 h-6" : "w-3 h-3";
  const txc = large ? "text-base" : "text-[11px]";
  const lbc = large ? "text-[9px]" : "text-[7px]";
  const badgeW = large ? "w-7 h-7" : "w-4 h-4";
  const plusW = large ? "w-4 h-4" : "w-2.5 h-2.5";

  return (
    <div className="flex flex-col h-full gap-0.5">
      <div className="flex-1 flex items-center gap-1.5 px-2 rounded-lg bg-background/90 border border-border/50">
        <Fuel className={`${ic} shrink-0`} style={{ color: FUEL_COLOR }} />
        <span className={`font-display font-bold ${txc} tabular-nums leading-none`} style={{ color: FUEL_COLOR }}>{fuel.toLocaleString()}</span>
        <span className={`${lbc} uppercase tracking-wider hidden sm:inline leading-none`} style={{ color: FUEL_COLOR }}>Fuel</span>
      </div>
      <div className="flex-1 flex items-center gap-1.5 px-2 rounded-lg bg-background/90 border border-border/50">
        <Sparkles className={`${ic} shrink-0`} style={{ color: STARDUST_COLOR }} />
        <span className={`font-display font-bold ${txc} tabular-nums leading-none`} style={{ color: STARDUST_COLOR }}>{stardust.toLocaleString()}</span>
        <span className={`${lbc} uppercase tracking-wider hidden sm:inline leading-none`} style={{ color: STARDUST_COLOR }}>Stardust</span>
      </div>
      <Link to="/crystal-store" className="group flex-1 flex items-center gap-1.5 px-2 rounded-lg bg-background/90 border border-amber-500/30 hover:bg-amber-500/15 transition-colors">
        <Gem className={`${ic} shrink-0`} style={{ color: "#FFD700" }} />
        <span className={`font-display font-bold ${txc} tabular-nums leading-none`} style={{ color: "#FFD700" }}>{crystals.toLocaleString()}</span>
        <motion.span
          className={`ml-auto flex items-center justify-center ${badgeW} rounded-full bg-gradient-to-b from-amber-400 to-amber-500 shrink-0`}
          style={{ boxShadow: "0 0 8px #FFD700, 0 0 3px #FFD700" }}
          animate={{ scale: [1, 1.18, 1] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          whileHover={{ scale: 1.3 }}
        >
          <Plus className={`${plusW} text-amber-950`} strokeWidth={3.5} />
        </motion.span>
      </Link>
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FlaskConical, X, Rocket } from "lucide-react";
import { getActiveBuffs, STAT_ICONS } from "@/lib/gameData";
import { getActiveFuelMounts } from "@/lib/fuelMounts";

// Live countdown label for a buff expiry.
function useCountdown(expiresAt) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, new Date(expiresAt).getTime() - now);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function BuffChip({ buff }) {
  const remaining = useCountdown(buff.expires_at);
  const statLabel = buff.stat === "all" ? "ALL" : (STAT_ICONS[buff.stat] + " " + buff.stat);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5"
      title={`${buff.name} · expires in ${remaining}`}
    >
      <FlaskConical className="w-3.5 h-3.5 text-accent shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] font-display font-semibold text-accent leading-tight truncate">
          +{Math.round((buff.mult || 0) * 100)}% {statLabel}
        </p>
        <p className="text-[9px] text-muted-foreground leading-tight truncate">{buff.name}</p>
      </div>
      <span className="text-[10px] font-mono text-accent/80 shrink-0 tabular-nums">{remaining}</span>
    </motion.div>
  );
}

// Live countdown chip for an active fuel mount — shown alongside stims.
function FuelMountChip({ mount }) {
  const remaining = useCountdown(mount.expires_at);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className="flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-2.5 py-1.5"
      title={`${mount.name} · expires in ${remaining}`}
    >
      <Rocket className="w-3.5 h-3.5 text-amber-400 shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] font-display font-semibold text-amber-300 leading-tight truncate">
          -{Math.round((mount.speed || 0) * 100)}% Mission Time
        </p>
        <p className="text-[9px] text-muted-foreground leading-tight truncate">{mount.name}</p>
      </div>
      <span className="text-[10px] font-mono text-amber-400/80 shrink-0 tabular-nums">{remaining}</span>
    </motion.div>
  );
}

// Shows currently-active stims (from character.active_buffs) and fuel mounts
// (from character.active_fuel_mounts) with a live remaining-duration countdown.
// Renders nothing when neither is active.
export default function ActiveBuffsBar({ character }) {
  const buffs = getActiveBuffs(character);
  const fuelMounts = getActiveFuelMounts(character);
  if ((!buffs || buffs.length === 0) && fuelMounts.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <AnimatePresence>
        {buffs.map((b, i) => (
          <BuffChip key={`${b.name}-${i}`} buff={b} />
        ))}
        {fuelMounts.map((m, i) => (
          <FuelMountChip key={`fuel-${m.id}-${i}`} mount={m} />
        ))}
      </AnimatePresence>
    </div>
  );
}
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Fuel, Gem, Rocket } from "lucide-react";
import { api } from "@/api/gameClient";
import { trackNovaSpend } from "@/lib/novaTracker";
import { FUEL_MOUNTS, MAX_FUEL_MOUNTS, getActiveFuelMounts, getFuelMountById } from "@/lib/fuelMounts";
import { useToast } from "@/components/ui/use-toast";

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

function ActiveMountChip({ mount }) {
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

export default function FuelStation({ character, onUpdate }) {
  const [buying, setBuying] = useState(null);
  const { toast } = useToast();
  const active = getActiveFuelMounts(character);
  const activeMount = active[0] || null;
  const activeSpeed = activeMount ? activeMount.speed : 0;

  async function handleBuy(mount) {
    if ((character.stardust || 0) < mount.stardust) {
      toast({ title: "Not enough stardust", description: `Need ${mount.stardust} ✨ — you have ${character.stardust || 0}.`, variant: "destructive" });
      return;
    }
    if (mount.crystals && (character.nova_crystals || 0) < mount.crystals) {
      toast({ title: "Not enough Nova Crystals", description: `Need ${mount.crystals} 💎 — you have ${character.nova_crystals || 0}.`, variant: "destructive" });
      return;
    }
    const now = Date.now();
    const durationMs = mount.duration_hours * 3600 * 1000;
    // Active mount already stacked to the 3× cap — can't extend, don't charge.
    if (activeMount && new Date(activeMount.expires_at).getTime() - now >= durationMs * MAX_FUEL_MOUNTS) {
      toast({ title: "Can't use", description: `${mount.emoji} ${mount.name} is already stacked to the max (${MAX_FUEL_MOUNTS}×).`, variant: "destructive" });
      return;
    }
    setBuying(mount.id);
    try {
      let entry;
      if (!activeMount) {
        entry = {
          id: mount.id, name: mount.name, emoji: mount.emoji, speed: mount.speed,
          expires_at: new Date(now + durationMs).toISOString(),
        };
      } else {
        // Only the TIMER stacks (capped at 3× the new mount's base duration).
        // Speed does NOT stack — the stronger of the two wins.
        const baseExpiry = Math.max(now, new Date(activeMount.expires_at).getTime());
        const newExpiry = Math.min(baseExpiry + durationMs, now + durationMs * MAX_FUEL_MOUNTS);
        const speed = Math.max(activeMount.speed || 0, mount.speed);
        const rep = mount.speed >= (activeMount.speed || 0) ? mount : (getFuelMountById(activeMount.id) || mount);
        entry = { id: rep.id, name: rep.name, emoji: rep.emoji, speed, expires_at: new Date(newExpiry).toISOString() };
      }
      const patch = {
        stardust: (character.stardust || 0) - mount.stardust,
        nova_crystals: (character.nova_crystals || 0) - (mount.crystals || 0),
        active_fuel_mounts: [entry],
      };
      await api.entities.Character.update(character.id, patch);
      onUpdate((c) => ({ ...c, ...patch }));
      void trackNovaSpend(character, mount.crystals || 0, "fuel_mount");
      const extended = !!activeMount;
      toast({
        title: `${mount.emoji} ${mount.name} engaged!`,
        description: `-${Math.round(entry.speed * 100)}% mission time${extended ? " · timer extended" : ""}.`,
      });
    } catch (e) {
      toast({ title: "Purchase failed", description: e.message, variant: "destructive" });
    } finally {
      setBuying(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-xs font-display font-semibold text-muted-foreground tracking-wide flex items-center gap-1.5">
          <Fuel className="w-3.5 h-3.5 text-amber-400" /> FUEL STATION
        </h2>
        {activeSpeed > 0 && (
          <span className="text-[10px] bg-amber-500/10 text-amber-300 px-2 py-1 rounded-full font-medium flex items-center gap-1">
            <Rocket className="w-3 h-3" /> -{Math.round(activeSpeed * 100)}% Mission Time
          </span>
        )}
      </div>

      {activeMount && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <AnimatePresence>
            <ActiveMountChip key={`fuel-${activeMount.id}`} mount={activeMount} />
          </AnimatePresence>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FUEL_MOUNTS.map((mount) => {
          const canAfford =
            (character.stardust || 0) >= mount.stardust &&
            (!mount.crystals || (character.nova_crystals || 0) >= mount.crystals);
          const disabled = !canAfford || buying === mount.id;
          return (
            <div key={mount.id} className="painted-panel canvas-grain p-4 flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-400/30 flex items-center justify-center text-2xl shrink-0 border-glow-cyan">
                {mount.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-display font-bold text-sm text-foreground truncate">{mount.name}</p>
                  <span className="text-[9px] font-display font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 shrink-0">-{Math.round(mount.speed * 100)}%</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-tight line-clamp-1">{mount.desc}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">⏱ {mount.duration_hours}h duration</p>
              </div>
              <button
                onClick={() => handleBuy(mount)}
                disabled={disabled}
                className="shrink-0 text-xs px-3 py-2 rounded-lg font-display font-semibold tracking-wide transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-400/30 flex flex-col items-center gap-0.5 min-w-[68px]"
              >
                {buying === mount.id ? (
                  <span className="w-4 h-4 border-2 border-amber-300 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span className="flex items-center gap-1"><Gem className="w-3 h-3 opacity-0" />✨ {mount.stardust}</span>
                    {mount.crystals > 0 && <span className="flex items-center gap-1 text-primary">💎 {mount.crystals}</span>}
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">
        Additional purchases extend the active timer (up to {MAX_FUEL_MOUNTS}×) — the speed bonus does not stack; the strongest mount's speed applies.
      </p>
    </div>
  );
}
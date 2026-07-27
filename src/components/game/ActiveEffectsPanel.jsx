import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FlaskConical, Rocket, X, Zap } from "lucide-react";
import { api } from "@/api/gameClient";
import { getActiveBuffs, STAT_ICONS } from "@/lib/gameData";
import { getActiveFuelMounts } from "@/lib/fuelMounts";
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

// Character-sheet-only panel: lists active stims and fuel mounts with a
// remove button for each. Shown only on the Character page.
export default function ActiveEffectsPanel({ character, onUpdate }) {
  const { toast } = useToast();
  const [removing, setRemoving] = useState(null);
  const buffs = getActiveBuffs(character);
  const fuelMounts = getActiveFuelMounts(character);

  if (buffs.length === 0 && fuelMounts.length === 0) return null;

  async function removeBuff(buff) {
    const key = `buff-${buff.name}-${buff.expires_at}`;
    setRemoving(key);
    const raw = (character.active_buffs || []).filter(
      (b) => !(b.name === buff.name && b.expires_at === buff.expires_at && b.stat === buff.stat && b.mult === buff.mult)
    );
    try {
      await api.entities.Character.update(character.id, { active_buffs: raw });
      onUpdate((c) => ({ ...c, active_buffs: raw }));
      toast({ title: "Stim removed", description: buff.name });
    } catch (e) {
      toast({ title: "Failed to remove", description: e.message, variant: "destructive" });
    } finally {
      setRemoving(null);
    }
  }

  async function removeMount(mount) {
    const key = `mount-${mount.id}-${mount.expires_at}`;
    setRemoving(key);
    const raw = (character.active_fuel_mounts || []).filter(
      (m) => !(m.id === mount.id && m.expires_at === mount.expires_at)
    );
    try {
      await api.entities.Character.update(character.id, { active_fuel_mounts: raw });
      onUpdate((c) => ({ ...c, active_fuel_mounts: raw }));
      toast({ title: "Fuel mount removed", description: mount.name });
    } catch (e) {
      toast({ title: "Failed to remove", description: e.message, variant: "destructive" });
    } finally {
      setRemoving(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-4"
    >
      <h2 className="text-xs font-display font-semibold text-muted-foreground tracking-wide mb-3 flex items-center gap-1.5">
        <Zap className="w-3.5 h-3.5 text-accent" /> ACTIVE EFFECTS
      </h2>
      <div className="grid sm:grid-cols-2 gap-2">
        <AnimatePresence>
          {buffs.map((b, i) => {
            const key = `buff-${b.name}-${i}`;
            const statLabel = b.stat === "all" ? "ALL" : (STAT_ICONS[b.stat] + " " + b.stat);
            return (
              <BuffRow key={key} buff={b} statLabel={statLabel} loading={removing === key} onRemove={() => removeBuff(b)} />
            );
          })}
          {fuelMounts.map((m, i) => {
            const key = `mount-${m.id}-${i}`;
            return (
              <MountRow key={key} mount={m} loading={removing === key} onRemove={() => removeMount(m)} />
            );
          })}
        </AnimatePresence>
      </div>
      <p className="text-[10px] text-muted-foreground/60 mt-2 italic">Remove an effect to cancel it immediately.</p>
    </motion.div>
  );
}

function BuffRow({ buff, statLabel, loading, onRemove }) {
  const remaining = useCountdown(buff.expires_at);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5"
    >
      <FlaskConical className="w-3.5 h-3.5 text-accent shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-display font-semibold text-accent leading-tight truncate">
          +{Math.round((buff.mult || 0) * 100)}% {statLabel}
        </p>
        <p className="text-[9px] text-muted-foreground leading-tight truncate">{buff.name} · {remaining}</p>
      </div>
      <button
        onClick={onRemove}
        disabled={loading}
        title="Remove"
        className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
      >
        {loading ? <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" /> : <X className="w-3.5 h-3.5" />}
      </button>
    </motion.div>
  );
}

function MountRow({ mount, loading, onRemove }) {
  const remaining = useCountdown(mount.expires_at);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-2.5 py-1.5"
    >
      <Rocket className="w-3.5 h-3.5 text-amber-400 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-display font-semibold text-amber-300 leading-tight truncate">
          -{Math.round((mount.speed || 0) * 100)}% Mission Time
        </p>
        <p className="text-[9px] text-muted-foreground leading-tight truncate">{mount.name} · {remaining}</p>
      </div>
      <button
        onClick={onRemove}
        disabled={loading}
        title="Remove"
        className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
      >
        {loading ? <span className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /> : <X className="w-3.5 h-3.5" />}
      </button>
    </motion.div>
  );
}
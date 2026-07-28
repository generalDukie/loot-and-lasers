import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FlaskConical, Rocket, X, Zap } from "lucide-react";
import { api } from "@/api/gameClient";
import { getActiveBuffs, STAT_ICONS, getStatColor } from "@/lib/gameData";
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
export default function ActiveEffectsPanel({ character, onUpdate, embedded = false }) {
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
    try {
      const res = await api.functions.invoke("DismissFuelMount", {
        mount_id: mount.id,
        expires_at: mount.expires_at,
      });
      const patch = res.patch || res.data?.patch || {};
      onUpdate((c) => ({ ...c, ...patch }));
      toast({ title: "Fuel mount removed", description: mount.name });
    } catch (e) {
      toast({ title: "Failed to remove", description: e.message, variant: "destructive" });
    } finally {
      setRemoving(null);
    }
  }

  const rows = (
    <AnimatePresence>
      {buffs.map((b, i) => {
        const key = `buff-${b.name}-${i}`;
        const statLabel = b.stat === "all" ? "ALL" : (STAT_ICONS[b.stat] + " " + b.stat);
        return (
          <BuffRow key={key} buff={b} statLabel={statLabel} compact={!!embedded} loading={removing === key} onRemove={() => removeBuff(b)} />
        );
      })}
      {fuelMounts.map((m, i) => {
        const key = `mount-${m.id}-${i}`;
        return (
          <MountRow key={key} mount={m} compact={!!embedded} loading={removing === key} onRemove={() => removeMount(m)} />
        );
      })}
    </AnimatePresence>
  );

  if (embedded) {
    const stacked = embedded === "side";
    return (
      <div className={`min-w-0 ${stacked ? "flex flex-col gap-1.5 h-full" : "flex flex-wrap items-center gap-1"}`}>
        <p className={`text-[8px] font-display font-bold tracking-wide text-muted-foreground flex items-center gap-0.5 shrink-0 ${stacked ? "mb-0.5" : "mr-0.5"}`}>
          <Zap className="w-2.5 h-2.5 text-accent" />
          {stacked ? "EFFECTS" : null}
        </p>
        <div className={stacked ? "space-y-1 min-h-0 overflow-y-auto flex-1" : "contents"}>
          {rows}
        </div>
      </div>
    );
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
      <div className="grid sm:grid-cols-2 gap-2">{rows}</div>
      <p className="text-[10px] text-muted-foreground/60 mt-2 italic">Remove an effect to cancel it immediately.</p>
    </motion.div>
  );
}

function BuffRow({ buff, statLabel, compact, loading, onRemove }) {
  const remaining = useCountdown(buff.expires_at);
  const color = getStatColor(buff.stat);
  if (compact) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="flex items-center gap-1 rounded-md border px-1.5 py-0.5 w-full min-w-0"
        style={{ borderColor: `${color}59`, backgroundColor: `${color}1a` }}
      >
        <FlaskConical className="w-2.5 h-2.5 shrink-0" style={{ color }} />
        <span className="text-[9px] font-display font-semibold truncate" style={{ color }}>
          +{Math.round((buff.mult || 0) * 100)}% {statLabel}
        </span>
        <span className="text-[10px] font-display font-black tabular-nums shrink-0 px-1 py-px rounded-sm" style={{ color, backgroundColor: "rgba(0,0,0,0.45)" }}>{remaining}</span>
        <button
          onClick={onRemove}
          disabled={loading}
          title="Remove"
          className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
        >
          {loading ? (
            <span className="w-2 h-2 border-2 border-t-transparent rounded-full animate-spin block" style={{ borderColor: color, borderTopColor: "transparent" }} />
          ) : (
            <X className="w-2.5 h-2.5" />
          )}
        </button>
      </motion.div>
    );
  }
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5"
      style={{ borderColor: `${color}66`, backgroundColor: `${color}1a` }}
    >
      <FlaskConical className="w-3.5 h-3.5 shrink-0" style={{ color }} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-display font-semibold leading-tight truncate" style={{ color }}>
          +{Math.round((buff.mult || 0) * 100)}% {statLabel}
        </p>
        <p className="text-[10px] font-display font-black leading-tight truncate tabular-nums" style={{ color }}>
          {buff.name} · {remaining}
        </p>
      </div>
      <button
        onClick={onRemove}
        disabled={loading}
        title="Remove"
        className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
      >
        {loading ? (
          <span className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: color, borderTopColor: "transparent" }} />
        ) : (
          <X className="w-3.5 h-3.5" />
        )}
      </button>
    </motion.div>
  );
}

function MountRow({ mount, compact, loading, onRemove }) {
  const remaining = useCountdown(mount.expires_at);
  if (compact) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="flex items-center gap-1 rounded-md border border-amber-400/35 bg-amber-500/10 px-1.5 py-0.5 w-full min-w-0"
      >
        <Rocket className="w-2.5 h-2.5 text-amber-400 shrink-0" />
        <span className="text-[9px] font-display font-semibold text-amber-300 truncate">
          -{Math.round((mount.speed || 0) * 100)}% time
        </span>
        <span className="text-[10px] font-display font-black text-amber-300 tabular-nums shrink-0 px-1 py-px rounded-sm bg-black/45">{remaining}</span>
        <button
          onClick={onRemove}
          disabled={loading}
          title="Remove"
          className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
        >
          {loading ? (
            <span className="w-2 h-2 border-2 border-amber-400 border-t-transparent rounded-full animate-spin block" />
          ) : (
            <X className="w-2.5 h-2.5" />
          )}
        </button>
      </motion.div>
    );
  }
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
        <p className="text-[9px] text-muted-foreground leading-tight truncate">
          {mount.name} · {remaining}
        </p>
      </div>
      <button
        onClick={onRemove}
        disabled={loading}
        title="Remove"
        className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
      >
        {loading ? (
          <span className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <X className="w-3.5 h-3.5" />
        )}
      </button>
    </motion.div>
  );
}
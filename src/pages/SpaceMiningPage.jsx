import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { api } from "@/api/gameClient";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { Slider } from "@/components/ui/slider";
import { Pickaxe, Clock, Zap } from "lucide-react";
import { getMyCharacter } from "@/lib/socialEngine";

// Stardust yield = level × 12 × hours. Scales with both level and duration.
export function computeMiningReward(level, hours) {
  return Math.round((level || 1) * 12 * hours);
}

function formatRemaining(ms) {
  if (ms <= 0) return "Ready to collect!";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function SpaceMiningPage() {
  const [character, setCharacter] = useState(null);
  const [hours, setHours] = useState(4);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    async function init() {
      const char = await getMyCharacter();
      if (!char) {
        navigate("/create-character");
        return;
      }
      setCharacter(char);
    }
    init();
  }, [navigate]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!character) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const mining = !!character.mining_end_time;
  const endTime = mining ? new Date(character.mining_end_time).getTime() : 0;
  const remaining = mining ? endTime - now : 0;
  const complete = mining && remaining <= 0;
  const reward = mining ? character.mining_reward || 0 : computeMiningReward(character.level, hours);
  // Derive total duration from reward: reward = level × 12 × hours, so hours = reward / (level × 12)
  const totalDurationMs = mining ? ((reward / Math.max(1, (character.level || 1) * 12)) * 3600000) : 0;
  const startTime = mining ? endTime - totalDurationMs : 0;
  const progressPct = mining && totalDurationMs > 0 ? Math.min(100, Math.max(0, ((now - startTime) / totalDurationMs) * 100)) : 0;

  async function startMining() {
    if (character.active_mission_id && character.mission_end_time) {
      toast({ title: "🚀 Ship Busy", description: "Your ship is on a mission — finish or claim it before deploying the mining drone.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const end = new Date(Date.now() + hours * 3600 * 1000).toISOString();
      const r = computeMiningReward(character.level, hours);
      await api.entities.Character.update(character.id, { mining_end_time: end, mining_reward: r });
      setCharacter((c) => ({ ...c, mining_end_time: end, mining_reward: r }));
      toast({ title: "Mining started!", description: `Collect ${r} ✨ in ${hours}h.` });
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setBusy(false);
  }

  async function collectMining() {
    setBusy(true);
    try {
      const fresh = await api.entities.Character.get(character.id);
      const r = fresh.mining_reward || 0;
      await api.entities.Character.update(character.id, {
        stardust: (fresh.stardust || 0) + r,
        total_stardust_earned: (fresh.total_stardust_earned || 0) + r,
        mining_end_time: null,
        mining_reward: 0,
      });
      setCharacter((c) => ({
        ...c,
        stardust: (fresh.stardust || 0) + r,
        total_stardust_earned: (fresh.total_stardust_earned || 0) + r,
        mining_end_time: null,
        mining_reward: 0,
      }));
      toast({ title: "Node collected!", description: `+${r} ✨ stardust harvested.` });
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setBusy(false);
  }

  async function cancelMining() {
    setBusy(true);
    try {
      await api.entities.Character.update(character.id, { mining_end_time: null, mining_reward: 0 });
      setCharacter((c) => ({ ...c, mining_end_time: null, mining_reward: 0 }));
      toast({ title: "Mining aborted", description: "Drone recalled — no stardust recovered. Let it finish to collect the full yield." });
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setBusy(false);
  }

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="font-display font-bold text-xl tracking-wider flex items-center gap-2">
          <Pickaxe className="w-5 h-5 text-amber-300" /> Space Mining
        </h1>
        <span className="flex items-center gap-1.5 text-xs text-accent font-display font-bold">
          ✨ {character.stardust || 0}
        </span>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="painted-panel canvas-grain p-6 text-center"
      >
        {/* Mining node visual */}
        <div className="relative h-40 flex items-center justify-center mb-4">
          {mining ? (
            <motion.div
              animate={complete ? { scale: [1, 1.15, 1], rotate: [0, 5, -5, 0] } : { y: [0, -8, 0] }}
              transition={{ duration: complete ? 0.8 : 3, repeat: Infinity, ease: "easeInOut" }}
              className="text-6xl"
            >
              {complete ? "💎" : "⛏️"}
            </motion.div>
          ) : (
            <motion.div
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="text-6xl opacity-80"
            >
              🪨
            </motion.div>
          )}
          {mining && !complete && (
            <motion.div
              animate={{ opacity: [0.2, 0.8, 0.2] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="absolute inset-0 rounded-full"
              style={{ boxShadow: "0 0 60px rgba(245,158,11,0.3)" }}
            />
          )}
          {complete && (
            <motion.div
              animate={{ opacity: [0, 1, 0], scale: [0.8, 1.4, 0.8] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 rounded-full"
              style={{ boxShadow: "0 0 80px rgba(34,197,94,0.5)" }}
            />
          )}
        </div>

        {!mining ? (
          <>
            <h2 className="font-display font-bold text-base mb-1">Deploy Mining Drone</h2>
            <p className="text-xs text-muted-foreground mb-5">
              Set your drone to mine a stardust node. The longer it runs, the more you collect — yield scales with your level.
            </p>

            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="w-3.5 h-3.5" /> Duration
              </span>
              <span className="font-display font-bold text-primary text-base">{hours}h</span>
            </div>
            <Slider value={[hours]} min={1} max={24} step={1} onValueChange={(v) => setHours(v[0])} className="mb-1" />
            <div className="flex justify-between text-[9px] text-muted-foreground mb-5">
              <span>1h</span>
              <span>12h</span>
              <span>24h</span>
            </div>

            <div className="flex items-center justify-center gap-2 mb-5">
              <span className="text-xs bg-accent/10 text-accent px-3 py-1 rounded-full font-display font-bold">
                {reward} ✨ projected
              </span>
              <span className="text-[10px] text-muted-foreground">
                ({character.level} × 12 × {hours}h)
              </span>
            </div>

            <button
              onClick={startMining}
              disabled={busy}
              className="w-full text-sm px-4 py-3 rounded-lg font-display font-bold painted-btn flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? (
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              Start Mining
            </button>
          </>
        ) : !complete ? (
          <>
            <h2 className="font-display font-bold text-base mb-1">Mining in Progress</h2>
            <p className="text-xs text-muted-foreground mb-4">Your drone is harvesting a stardust node...</p>

            <div className="mb-2">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="flex items-center gap-1 text-amber-300 font-display font-bold">
                  <Clock className="w-3.5 h-3.5" /> {formatRemaining(remaining)}
                </span>
                <span className="text-accent font-display font-bold">{reward} ✨</span>
              </div>
              <div className="h-2.5 rounded-full bg-muted/40 border border-border/50 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300"
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>

            <button
              onClick={cancelMining}
              disabled={busy}
              className="w-full text-xs px-4 py-2 rounded-lg font-display font-semibold bg-muted/40 hover:bg-muted/60 text-muted-foreground mt-3"
            >
              Abort (no reward)
            </button>
          </>
        ) : (
          <>
            <motion.h2
              initial={{ scale: 0.6 }}
              animate={{ scale: 1 }}
              className="font-display font-black text-lg text-green-400 glow-green mb-1"
            >
              NODE READY!
            </motion.h2>
            <p className="text-xs text-muted-foreground mb-4">Your drone finished mining a stardust node.</p>

            <div className="text-4xl font-display font-black text-accent mb-4 glow-cyan">+{reward} ✨</div>

            <button
              onClick={collectMining}
              disabled={busy}
              className="w-full text-sm px-4 py-3 rounded-lg font-display font-bold painted-btn flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? (
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                "✨"
              )}
              Collect Stardust
            </button>
          </>
        )}
      </motion.div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-card/40 border border-border/40 rounded-xl p-3">
          <p className="font-display font-bold text-sm text-primary">{character.level}</p>
          <p className="text-[9px] text-muted-foreground tracking-wide">YOUR LEVEL</p>
        </div>
        <div className="bg-card/40 border border-border/40 rounded-xl p-3">
          <p className="font-display font-bold text-sm text-amber-300">12/h</p>
          <p className="text-[9px] text-muted-foreground tracking-wide">BASE RATE</p>
        </div>
        <div className="bg-card/40 border border-border/40 rounded-xl p-3">
          <p className="font-display font-bold text-sm text-accent">{Math.round((character.level || 1) * 12 * 24)}</p>
          <p className="text-[9px] text-muted-foreground tracking-wide">MAX (24h)</p>
        </div>
      </div>
    </div>
  );
}
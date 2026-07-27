import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { api } from "@/api/gameClient";
import { trackNovaSpend } from "@/lib/novaTracker";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { getMyCharacter } from "@/lib/socialEngine";
import { Gem, Sparkles, Dice5 } from "lucide-react";
import CrystalFlip from "@/components/casino/CrystalFlip";
import CrystalJackpot from "@/components/casino/CrystalJackpot";
import StardustDice from "@/components/casino/StardustDice";
import StardustWheel from "@/components/casino/StardustWheel";

export default function CasinoPage() {
  const [character, setCharacter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const load = useCallback(async () => {
    const char = await getMyCharacter();
    if (!char) { navigate("/create-character"); return; }
    setCharacter(char);
    setLoading(false);
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  // Apply a net currency delta atomically — reads the freshest balance first
  // so rapid plays can't overdraw.
  async function settle(deltaCrystals, deltaStardust) {
    setBusy(true);
    try {
      const fresh = await api.entities.Character.get(character.id);
      const upd = {
        stardust: Math.max(0, (fresh.stardust || 0) + deltaStardust),
        nova_crystals: Math.max(0, (fresh.nova_crystals || 0) + deltaCrystals),
      };
      await api.entities.Character.update(character.id, upd);
      setCharacter((c) => ({ ...c, ...upd }));
      if (deltaCrystals < 0) void trackNovaSpend(fresh, -deltaCrystals, "casino");
    } catch (e) {
      toast({ title: "Wager failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  if (!character) return null;

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display font-bold text-xl tracking-wider flex items-center gap-2 mb-1">
          <Dice5 className="w-5 h-5 text-amber-300" /> Nebula Casino
        </h1>
        <p className="text-xs text-muted-foreground mb-3">Risk it for the glittering prize. The house always remembers.</p>
        <div className="flex items-center gap-3 mb-1">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card/60 border border-border/50 text-sm font-display font-bold">
            <Sparkles className="w-3.5 h-3.5 text-accent" /> {(character.stardust || 0).toLocaleString()}
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card/60 border border-amber-500/30 text-sm font-display font-bold text-amber-300">
            <Gem className="w-3.5 h-3.5" /> {(character.nova_crystals || 0).toLocaleString()}
          </span>
        </div>
      </motion.div>

      <div className="grid sm:grid-cols-2 gap-4">
        <CrystalFlip character={character} onSettle={settle} busy={busy} />
        <CrystalJackpot character={character} onSettle={settle} busy={busy} />
        <StardustDice character={character} onSettle={settle} busy={busy} />
        <StardustWheel character={character} onSettle={settle} busy={busy} />
      </div>

      <p className="text-[10px] text-muted-foreground/70 text-center italic">
        Nova Crystal bets are capped at 100 per play. Play responsibly, operative.
      </p>
    </div>
  );
}
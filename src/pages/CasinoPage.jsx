import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { api } from "@/api/gameClient";
import { trackNovaSpend } from "@/lib/novaTracker";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { getMyCharacter, primeMyCharacterCache } from "@/lib/socialEngine";
import { getCasinoMaxStardustBet } from "@/lib/gameData";
import { Gem, Sparkles, Dice5 } from "lucide-react";
import CrystalFlip from "@/components/casino/CrystalFlip";
import CrystalJackpot from "@/components/casino/CrystalJackpot";
import StardustDice from "@/components/casino/StardustDice";
import StardustWheel from "@/components/casino/StardustWheel";

/** Nova crystal tables stay locked until Crystal Store IAP is live. */
const NOVA_CASINO_OPEN = false;

export default function CasinoPage() {
  const outlet = useOutletContext() || {};
  const [localCharacter, setLocalCharacter] = useState(null);
  const character = outlet.character || localCharacter;
  const setSharedCharacter = outlet.setCharacter;
  const [loading, setLoading] = useState(!outlet.character);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const applyCharacter = useCallback((next) => {
    if (!next) return;
    primeMyCharacterCache(next);
    if (typeof setSharedCharacter === "function") setSharedCharacter(next);
    setLocalCharacter(next);
  }, [setSharedCharacter]);

  const load = useCallback(async () => {
    const char = await getMyCharacter({ force: true });
    if (!char) { navigate("/create-character"); return; }
    applyCharacter(char);
    setLoading(false);
  }, [navigate, applyCharacter]);

  useEffect(() => {
    if (outlet.character) {
      setLocalCharacter(outlet.character);
      setLoading(false);
      return;
    }
    load();
  }, [outlet.character, load]);

  // Server-authoritative casino settle — games roll outcomes server-side.
  async function settle(game, bet, extra = {}) {
    setBusy(true);
    try {
      const res = await api.functions.invoke("CasinoSettle", { game, bet, ...extra });
      const patch = res.patch || res.data?.patch || {};
      const updated = res.character || res.data?.character;
      if (updated && updated.id) {
        applyCharacter(updated);
      } else if (Object.keys(patch).length) {
        applyCharacter({ ...(character || {}), ...patch });
      }
      const deltaCrystals = res.delta_crystals ?? res.data?.delta_crystals ?? 0;
      if (deltaCrystals < 0) void trackNovaSpend(character, -deltaCrystals, "casino");
      return res;
    } catch (e) {
      toast({ title: "Wager failed", description: e.message, variant: "destructive" });
      throw e;
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

  const maxSdBet = getCasinoMaxStardustBet(character.level || 1);

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display font-bold text-xl tracking-wider flex items-center gap-2 mb-1">
          <Dice5 className="w-5 h-5 text-amber-300" /> Nebula Casino
        </h1>
        <p className="text-xs text-muted-foreground mb-3">Risk it for the glittering prize. The house always remembers.</p>
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card/60 border border-border/50 text-sm font-display font-bold">
            <Sparkles className="w-3.5 h-3.5 text-accent" /> {(character.stardust || 0).toLocaleString()}
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card/60 border border-amber-500/30 text-sm font-display font-bold text-amber-300">
            <Gem className="w-3.5 h-3.5" /> {(character.nova_crystals || 0).toLocaleString()}
          </span>
          <span className="text-[10px] text-muted-foreground">
            Max stardust bet · {maxSdBet.toLocaleString()} ✨ (scales with SD/F)
          </span>
        </div>
      </motion.div>

      <div className="grid sm:grid-cols-2 gap-4">
        {NOVA_CASINO_OPEN ? (
          <>
            <CrystalFlip character={character} onSettle={settle} busy={busy} />
            <CrystalJackpot character={character} onSettle={settle} busy={busy} />
          </>
        ) : (
          <div className="sm:col-span-2 painted-panel canvas-grain p-4 border border-amber-500/25 relative overflow-hidden">
            <div className="absolute inset-0 bg-background/55 backdrop-blur-[1px]" />
            <div className="relative flex flex-col sm:flex-row sm:items-center gap-3">
              <Gem className="w-8 h-8 text-amber-300/70 shrink-0" />
              <div className="min-w-0">
                <h3 className="font-display font-bold text-sm text-amber-200">Crystal tables sealed</h3>
                <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                  Nova Crystal games are locked until the Crystal Store is live — they were minting hard currency.
                  Stardust games below are still open.
                </p>
              </div>
            </div>
          </div>
        )}
        <StardustDice character={character} onSettle={settle} busy={busy} maxBet={maxSdBet} />
        <StardustWheel character={character} onSettle={settle} busy={busy} maxBet={maxSdBet} />
      </div>

      <p className="text-[10px] text-muted-foreground/70 text-center italic">
        {NOVA_CASINO_OPEN
          ? "Nova Crystal bets are capped at 100 per play. Play responsibly, operative."
          : "Earn Nova from Weekly Ops & daily login — don't gamble what the void won't refill."}
      </p>
    </div>
  );
}

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { api } from "@/api/gameClient";
import { trackNovaSpend } from "@/lib/novaTracker";
import { trackStardustSpend } from "@/lib/stardustTracker";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { getMyCharacter, primeMyCharacterCache } from "@/lib/socialEngine";
import {
  getCasinoMaxStardustBet,
  getCasinoMinStardustBet,
  CASINO_MIN_NOVA_BET,
  CASINO_MAX_NOVA_BET,
  STARDUST_COLOR,
} from "@/lib/gameData";
import { Gem, Dice5 } from "lucide-react";
import StardustIcon from "@/components/game/StardustIcon";
import GalacticDice from "@/components/casino/GalacticDice";
import StardustWheel from "@/components/casino/StardustWheel";
import CrystalRefining from "@/components/casino/CrystalRefining";
import SmugglersCache from "@/components/casino/SmugglersCache";
import PageStage from "@/components/game/PageStage";
import { useAuth } from "@/lib/AuthContext";

function newRequestId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export default function CasinoPage() {
  const outlet = useOutletContext() || {};
  const { user } = useAuth();
  const [localCharacter, setLocalCharacter] = useState(null);
  const character = outlet.character || localCharacter;
  const setSharedCharacter = outlet.setCharacter;
  const [loading, setLoading] = useState(!outlet.character);
  const [busy, setBusy] = useState(false);
  const [casino, setCasino] = useState(null);
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
    try {
      const state = await api.functions.invoke("GetCasinoState", {});
      setCasino(state.casino || state.data?.casino || null);
      const updated = state.character || state.data?.character;
      if (updated) applyCharacter(updated);
    } catch {
      /* limits fall back to local formulas */
    }
    setLoading(false);
  }, [navigate, applyCharacter]);

  useEffect(() => {
    load();
  }, [load]);

  function applySettleResponse(res) {
    const patch = res.patch || res.data?.patch || {};
    const updated = res.character || res.data?.character;
    if (updated && updated.id) {
      applyCharacter(updated);
    } else if (Object.keys(patch).length) {
      applyCharacter({ ...(character || {}), ...patch });
    }
    if (res.casino || res.data?.casino) {
      setCasino(res.casino || res.data?.casino);
    }
    const deltaCrystals = res.delta_crystals ?? res.data?.delta_crystals ?? 0;
    const deltaStardust = res.delta_stardust ?? res.data?.delta_stardust ?? 0;
    if (deltaCrystals < 0) void trackNovaSpend(character, -deltaCrystals, "casino");
    if (deltaStardust < 0) void trackStardustSpend(character, -deltaStardust, "casino");
  }

  async function settle(game, bet, extra = {}) {
    setBusy(true);
    try {
      const res = await api.functions.invoke("CasinoSettle", {
        game,
        bet,
        request_id: newRequestId("casino"),
        ...extra,
      });
      applySettleResponse(res);
      return res;
    } catch (e) {
      toast({ title: "Wager failed", description: e.message, variant: "destructive" });
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function sessionStart(game, bet) {
    setBusy(true);
    try {
      const res = await api.functions.invoke("CasinoSessionStart", {
        game,
        bet,
        request_id: newRequestId("csstart"),
      });
      applySettleResponse(res);
      return res;
    } catch (e) {
      toast({ title: "Session failed", description: e.message, variant: "destructive" });
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function sessionAction(sessionId, action, extra = {}) {
    setBusy(true);
    try {
      const res = await api.functions.invoke("CasinoSessionAction", {
        session_id: sessionId,
        action,
        request_id: newRequestId("csact"),
        ...extra,
      });
      applySettleResponse(res);
      return res;
    } catch (e) {
      toast({ title: "Action failed", description: e.message, variant: "destructive" });
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

  const minSd = casino?.stardust_limits?.min ?? getCasinoMinStardustBet(character.level || 1);
  const maxSd = casino?.stardust_limits?.max ?? getCasinoMaxStardustBet(character.level || 1);
  const wagerableNova =
    casino?.nova_limits?.wagerable_balance ??
    casino?.nova_limits?.wagerable ??
    0;
  const totalNova = casino?.nova_limits?.balance ?? character.nova_crystals ?? 0;
  // Admins may wager any Nova; non-admins stay on wagerable-only.
  const spendableNova = user?.role === "admin" ? totalNova : wagerableNova;
  const characterForCasino = {
    ...character,
    nova_wagerable: spendableNova,
    balances: {
      ...(character.balances || {}),
      nova_wagerable: spendableNova,
      nova_promotional: casino?.nova_limits?.promotional ?? 0,
      nova_crystals: totalNova,
    },
  };
  const activeRefine = (casino?.active_sessions || []).find((s) => s.game_id === "crystal_refining");
  const activeCache = (casino?.active_sessions || []).find((s) => s.game_id === "smugglers_cache");

  return (
    <PageStage className="items-center">
      <div className="w-full max-w-5xl mx-auto space-y-5">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <h1 className="font-display font-bold text-xl tracking-wider inline-flex items-center justify-center gap-2 mb-1">
            <Dice5 className="w-5 h-5 text-amber-300" /> Nebula Casino
          </h1>
          <p className="text-xs text-muted-foreground mb-3">Risk it for the glittering prize. The house always remembers.</p>
          <div className="flex items-center justify-center gap-3 mb-1 flex-wrap">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card/60 border border-border/50 text-sm font-display font-bold">
              <StardustIcon className="w-3.5 h-3.5" />{" "}
              <span style={{ color: STARDUST_COLOR }}>{(character.stardust || 0).toLocaleString()}</span>
            </span>
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card/60 border border-amber-500/30 text-sm font-display font-bold text-amber-300">
            <Gem className="w-3.5 h-3.5" />{" "}
            {(casino?.nova_limits?.balance ?? character.nova_crystals ?? 0).toLocaleString()}
            <span className="text-[10px] font-normal text-amber-200/80">
              (Wagerable {(casino?.nova_limits?.wagerable_balance ?? casino?.nova_limits?.wagerable ?? 0).toLocaleString()})
            </span>
          </span>
          <span className="text-[10px] text-muted-foreground">
            Stardust {minSd.toLocaleString()}–{maxSd.toLocaleString()} · Nova {CASINO_MIN_NOVA_BET}–{CASINO_MAX_NOVA_BET} ·{" "}
            {user?.role === "admin" ? "Admin: any Nova may be wagered" : "Casino uses Wagerable only"}
          </span>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <GalacticDice character={characterForCasino} onSettle={settle} busy={busy} minBet={minSd} maxBet={maxSd} />
          <StardustWheel character={characterForCasino} onSettle={settle} busy={busy} minBet={minSd} maxBet={maxSd} />
          <CrystalRefining
            character={characterForCasino}
            onSessionStart={sessionStart}
            onSessionAction={sessionAction}
            busy={busy}
            activeSession={activeRefine}
          />
          <SmugglersCache
            character={characterForCasino}
            onSessionStart={sessionStart}
            onSessionAction={sessionAction}
            busy={busy}
            activeSession={activeCache}
          />
        </div>

        <p className="text-[10px] text-muted-foreground/70 text-center italic">
          Entertainment only — payouts use the same currency you wager. Play responsibly, operative.
        </p>
      </div>
    </PageStage>
  );
}

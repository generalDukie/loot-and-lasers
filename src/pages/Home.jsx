import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import SpaceStationHub from "@/components/game/SpaceStationHub";
import NexusShowcase from "@/components/game/NexusShowcase";
import NexusChatter from "@/components/game/NexusChatter";
import DailyLoginModal from "@/components/social/DailyLoginModal";
import CodexModal from "@/components/game/CodexModal";
import LegacyNameModal from "@/components/game/LegacyNameModal";
import { getProgress, canClaimToday, todayUTC } from "@/lib/dailyLoginEngine";
import { useMyCharacter } from "@/hooks/useMyCharacter";
import { useAuth } from "@/lib/AuthContext";
import SiteTitle from "@/components/admin/SiteTitle";

export default function Home() {
  const { character, loading } = useMyCharacter();
  const { user } = useAuth();
  const [dailyOpen, setDailyOpen] = useState(false);
  const [codexOpen, setCodexOpen] = useState(false);
  const [legacyOpen, setLegacyOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!character) { navigate("/create-character"); return; }
    // Auto-open the daily login modal at most ONCE per day per account — swapping
    // characters or re-mounting Home must not re-pop it. The flag is keyed by user
    // + day so it resets at the next daily rollover. (Re-openable via Settings.)
    const dayKey = todayUTC();
    const shownFlag = `loot_daily_shown_${user?.id || "me"}_${dayKey}`;
    if (!localStorage.getItem(shownFlag)) {
      getProgress(character.id)
        .then((prog) => {
          localStorage.setItem(shownFlag, "1");
          if (canClaimToday(prog)) setDailyOpen(true);
        })
        .catch(() => {});
    }
    // One-time Codex guide on first login after character creation (per character).
    if (!localStorage.getItem(`loot_tutorial_${character.id}`)) {
      setCodexOpen(true);
      localStorage.setItem(`loot_tutorial_${character.id}`, "1");
    }
  }, [loading, character, navigate, user]);

  // Prompt for a permanent legacy name if the account doesn't have one yet.
  useEffect(() => {
    if (user && !user.legacy_name) setLegacyOpen(true);
  }, [user]);

  if (loading || !character) {
    return (
      <div className="fixed inset-0 flex items-center justify-center stars-bg">
        <div className="text-center">
          <SiteTitle as="h1" className="font-display font-bold text-3xl glow-cyan tracking-widest mb-4" />
          <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <>
      <SpaceStationHub character={character}>
        <NexusShowcase />
        <NexusChatter />
      </SpaceStationHub>
      <DailyLoginModal open={dailyOpen} onClose={() => setDailyOpen(false)} myChar={character} />
      <CodexModal open={codexOpen} onClose={() => setCodexOpen(false)} />
      <LegacyNameModal open={legacyOpen} onClose={() => setLegacyOpen(false)} />
    </>
  );
}
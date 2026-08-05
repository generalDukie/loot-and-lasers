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
import { api } from "@/api/gameClient";
import { needsLegacyName } from "@/lib/legacyName";

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

  // Catch-up prompt for accounts that already run multiple operatives without a
  // surname. Single-character accounts are asked during their second creation.
  useEffect(() => {
    if (!user?.id || user.legacy_name) return;
    let active = true;
    api.entities.Character.filter({ created_by_id: user.id }, "-created_date", 10)
      .then((roster) => {
        if (active && needsLegacyName(user, (roster || []).length)) setLegacyOpen(true);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [user]);

  if (loading || !character) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <SpaceStationHub>
        <NexusShowcase />
        <NexusChatter />
      </SpaceStationHub>
      <DailyLoginModal open={dailyOpen} onClose={() => setDailyOpen(false)} myChar={character} />
      <CodexModal open={codexOpen} onClose={() => setCodexOpen(false)} />
      <LegacyNameModal open={legacyOpen} onClose={() => setLegacyOpen(false)} />
    </>
  );
}

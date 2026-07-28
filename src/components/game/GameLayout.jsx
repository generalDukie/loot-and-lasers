import React, { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { api } from "@/api/gameClient";
import AnimatedPage from "@/components/game/AnimatedPage";
import PageErrorBoundary from "@/components/game/PageErrorBoundary";
import SpaceBackground from "@/components/game/SpaceBackground";
import TopBar from "@/components/game/TopBar";
import AdminDock from "@/components/admin/AdminDock";
import GameCanvas from "@/components/game/GameCanvas";
import InventoryFullModal from "@/components/game/InventoryFullModal";
import GlobalChatPanel from "@/components/social/GlobalChatPanel";
import DailyLoginModal from "@/components/social/DailyLoginModal";
import PublicProfileSheet from "@/components/social/PublicProfileSheet";
import NotificationCenter from "@/components/social/NotificationCenter";
import { getCharacterById } from "@/lib/socialEngine";
import { useMyCharacter } from "@/hooks/useMyCharacter";
import { usePresence } from "@/hooks/usePresence";
import { useAuth } from "@/lib/AuthContext";

export default function GameLayout() {
  const location = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { character, setCharacter } = useMyCharacter();
  const [chatOpen, setChatOpen] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [profile, setProfile] = useState(null);

  usePresence(character, "online");

  // Accumulate playtime while the app is open (feeds the public "Time Played" stat).
  useEffect(() => {
    if (!character?.id) return;
    let lastTick = Date.now();
    let base = character.playtime_seconds || 0;
    const interval = setInterval(async () => {
      const delta = Math.round((Date.now() - lastTick) / 1000);
      lastTick = Date.now();
      if (delta <= 0) return;
      base += delta;
      try {
        await api.entities.Character.update(character.id, { playtime_seconds: base });
      } catch {}
    }, 60000);
    return () => clearInterval(interval);
  }, [character?.id]);

  async function onTagSender(msg) {
    const c = await getCharacterById(msg.sender_id);
    if (c) setProfile(c);
  }

  return (
    <>
      <GameCanvas>
        <SpaceBackground />
        <div className="relative z-10 h-full w-full flex flex-col">
          <TopBar character={character} onOpenChat={() => setChatOpen(true)} />
          <main className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden px-4 sm:px-6 lg:px-8 pb-4 flex flex-col">
            <PageErrorBoundary key={location.pathname}>
              <AnimatedPage>
                <Outlet context={{ character, setCharacter }} />
              </AnimatedPage>
            </PageErrorBoundary>
          </main>
        </div>
      </GameCanvas>

      <AdminDock />

      <GlobalChatPanel open={chatOpen} onClose={() => setChatOpen(false)} myChar={character} onTagSender={onTagSender} />
      <DailyLoginModal open={dailyOpen} onClose={() => setDailyOpen(false)} myChar={character} />
      <InventoryFullModal character={character} />
      <NotificationCenter myChar={character} onOpenDaily={() => setDailyOpen(true)} />
      {profile && (
        <PublicProfileSheet target={profile} myChar={character} onClose={() => setProfile(null)} />
      )}
    </>
  );
}
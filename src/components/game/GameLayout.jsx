import React, { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { api } from "@/api/gameClient";
import AnimatedPage from "@/components/game/AnimatedPage";
import PageErrorBoundary from "@/components/game/PageErrorBoundary";
import SpaceBackground from "@/components/game/SpaceBackground";
import AdminDock from "@/components/admin/AdminDock";
import GameCanvas from "@/components/game/GameCanvas";
import PersistentGameFrame from "@/components/game/PersistentGameFrame";
import ShellSidebar from "@/components/game/ShellSidebar";
import ShellOperativePanel from "@/components/game/ShellOperativePanel";
import ShellTopChrome from "@/components/game/ShellTopChrome";
import InventoryFullModal from "@/components/game/InventoryFullModal";
import GlobalChatPanel from "@/components/social/GlobalChatPanel";
import DailyLoginModal from "@/components/social/DailyLoginModal";
import PublicProfileSheet from "@/components/social/PublicProfileSheet";
import NotificationCenter from "@/components/social/NotificationCenter";
import { getCharacterById } from "@/lib/socialEngine";
import { useMyCharacter } from "@/hooks/useMyCharacter";
import { usePresence } from "@/hooks/usePresence";

/**
 * Persistent application shell for all in-game routes.
 * Outer frame, left nav, and operative panel stay mounted; only <Outlet /> swaps.
 */
export default function GameLayout() {
  const location = useLocation();
  const { character, setCharacter } = useMyCharacter();
  const [chatOpen, setChatOpen] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [railOpen, setRailOpen] = useState(false);

  usePresence(character, "online");

  // Close mobile drawer on navigation.
  useEffect(() => {
    setRailOpen(false);
  }, [location.pathname]);

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

  const leftRail = (
    <aside
      className="flex flex-col min-h-0 h-full border-r"
      style={{
        borderColor: "hsl(210 18% 22%)",
        background: `
          linear-gradient(180deg, hsl(220 16% 11% / 0.98), hsl(222 22% 7% / 0.96)),
          repeating-linear-gradient(0deg, transparent, transparent 11px, hsl(190 40% 50% / 0.03) 11px, hsl(190 40% 50% / 0.03) 12px)
        `,
        boxShadow: "inset -1px 0 0 hsl(190 50% 50% / 0.08)",
      }}
    >
      <div
        className="shrink-0 px-2.5 py-1.5 border-b flex items-center justify-between"
        style={{ borderColor: "hsl(210 18% 22%)" }}
      >
        <span className="text-[7px] font-display font-bold tracking-[0.2em] text-primary/80">
          OPERATIVE CONSOLE
        </span>
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: "hsl(190 90% 55%)", boxShadow: "0 0 6px hsl(190 90% 50%)" }}
          aria-hidden
        />
      </div>
      <div className="shrink-0 max-h-[48%] overflow-y-auto border-b" style={{ borderColor: "hsl(210 18% 22%)" }}>
        <ShellOperativePanel character={character} />
      </div>
      <div className="flex-1 min-h-0 flex flex-col">
        <ShellSidebar onNavigate={() => setRailOpen(false)} />
      </div>
    </aside>
  );

  return (
    <>
      <GameCanvas>
        <SpaceBackground />
        <div className="relative z-10 h-full w-full min-h-0">
          <PersistentGameFrame>
            <div className="flex flex-col h-full min-h-0">
              <ShellTopChrome
                character={character}
                onOpenChat={() => setChatOpen(true)}
                onToggleRail={() => setRailOpen((v) => !v)}
                railOpen={railOpen}
              />

              <div className="flex-1 min-h-0 flex relative">
                {/* Desktop permanent left rail */}
                <div className="hidden lg:flex w-[clamp(15rem,13vw,19rem)] shrink-0 min-h-0">
                  {leftRail}
                </div>

                {/* Mobile / tablet drawer */}
                {railOpen && (
                  <button
                    type="button"
                    className="lg:hidden absolute inset-0 z-30 bg-black/55"
                    aria-label="Dismiss station panel"
                    onClick={() => setRailOpen(false)}
                  />
                )}
                <div
                  className={`lg:hidden absolute inset-y-0 left-0 z-40 w-[min(22rem,92vw)] min-h-0 transform transition-transform duration-200 ${
                    railOpen ? "translate-x-0" : "-translate-x-full"
                  }`}
                >
                  {leftRail}
                </div>

                {/* Central content — only this region remounts per route */}
                <main className="flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden px-3 sm:px-4 lg:px-6 pb-3 pt-2 flex flex-col">
                  <PageErrorBoundary key={location.pathname}>
                    <AnimatedPage>
                      <Outlet context={{ character, setCharacter }} />
                    </AnimatedPage>
                  </PageErrorBoundary>
                </main>
              </div>
            </div>
          </PersistentGameFrame>
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

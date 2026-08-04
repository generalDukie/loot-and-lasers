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
import ConnectivityBanner from "@/components/game/ConnectivityBanner";
import InventoryFullModal from "@/components/game/InventoryFullModal";
import DailyLoginModal from "@/components/social/DailyLoginModal";
import NotificationCenter from "@/components/social/NotificationCenter";
import { useMyCharacter } from "@/hooks/useMyCharacter";
import { usePresence } from "@/hooks/usePresence";
import { enforceInventoryCap } from "@/lib/inventoryCap";
import { primeMyCharacterCache } from "@/lib/socialEngine";
import { applyServerTimeSync, lastTimeSyncAgeMs } from "@/lib/gameTime";

/** Desktop operative side panel — % of the 16:9 game viewport (not browser vw). */
const DESKTOP_RAIL_W = "clamp(21.5rem, 18.1%, 26.9rem)";
const MOBILE_RAIL_W = "min(31.3rem, 92%)";

/**
 * Persistent application shell for all in-game routes.
 * Outer frame, left nav, and operative panel stay mounted; only <Outlet /> swaps.
 */
export default function GameLayout() {
  const location = useLocation();
  const { character, setCharacter } = useMyCharacter();
  const [dailyOpen, setDailyOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);

  usePresence(character, "online");

  // Sync server clock offset for display countdowns (never authoritative).
  useEffect(() => {
    let cancelled = false;
    async function sync() {
      try {
        const data = await api.time.now();
        if (!cancelled) applyServerTimeSync(data);
      } catch {
        /* offline / unauth — keep last offset */
      }
    }
    sync();
    const id = setInterval(() => {
      if (lastTimeSyncAgeMs() > 60_000) sync();
    }, 60_000);
    const onVis = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Force dissolve UI if the bag somehow exceeds the hard 10-item cap.
  useEffect(() => {
    if (character?.id) enforceInventoryCap(character);
  }, [character?.id]);

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

  const leftRail = (
    <aside
      className="flex flex-col min-h-0 h-full w-full border-r"
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
        className="shrink-0 px-3 py-2 border-b flex items-center justify-between"
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
      <div className="shrink-0 border-b" style={{ borderColor: "hsl(210 18% 22%)" }}>
        <ShellOperativePanel character={character} />
      </div>
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
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
            <div className="relative flex flex-col h-full min-h-0">
              <ConnectivityBanner />
              <ShellTopChrome
                character={character}
                onToggleRail={() => setRailOpen((v) => !v)}
                railOpen={railOpen}
              />

              <div className="flex-1 min-h-0 flex relative min-w-0 gap-[12px] sm:gap-[16px] lg:gap-[24px]">
                {/* Desktop operative console — in layout flow; main content cannot overlap */}
                <div
                  className="hidden lg:block shrink-0 min-h-0"
                  style={{ width: DESKTOP_RAIL_W }}
                >
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
                  className={`lg:hidden absolute inset-y-0 left-0 z-40 min-h-0 transform transition-transform duration-200 ${
                    railOpen ? "translate-x-0" : "-translate-x-full"
                  }`}
                  style={{ width: MOBILE_RAIL_W }}
                >
                  {leftRail}
                </div>

                <main className="relative flex-1 min-w-0 min-h-0 flex flex-col pl-0 pr-3 sm:pr-4 lg:pr-6 pb-3 pt-2">
                  <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col">
                    <PageErrorBoundary key={location.pathname}>
                      <AnimatedPage>
                        <Outlet context={{ character, setCharacter }} />
                      </AnimatedPage>
                    </PageErrorBoundary>
                  </div>
                </main>
              </div>

              {/* Overlay host covers content + chrome; left inset clears the desktop rail. */}
              <div
                id="gameplay-overlay-root"
                className="pointer-events-none absolute inset-0 z-[30] lg:z-[80] lg:left-[clamp(18.7rem,15.7%,23.4rem)]"
              />

              <NotificationCenter myChar={character} onOpenDaily={() => setDailyOpen(true)} />
            </div>
          </PersistentGameFrame>
        </div>
      </GameCanvas>

      <AdminDock />

      <DailyLoginModal
        open={dailyOpen}
        onClose={() => setDailyOpen(false)}
        myChar={character}
        onClaimed={(res) => {
          const patch = res?.applied || res?.patch || {};
          if (!character || !Object.keys(patch).length) return;
          const next = { ...character, ...patch };
          primeMyCharacterCache(next);
          setCharacter(next);
        }}
      />
      <InventoryFullModal
        character={character}
        onCharacterChange={(patch) => setCharacter((c) => (c ? { ...c, ...patch } : c))}
      />
    </>
  );
}

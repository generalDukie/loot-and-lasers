import React from "react";
import HubHeader from "@/components/game/HubHeader";
import StationSplitButton from "@/components/game/StationSplitButton";
import StationDockButton from "@/components/game/StationDockButton";
import SpaceBackground from "@/components/game/SpaceBackground";
import { useAuth } from "@/lib/AuthContext";
import { useHubLayout } from "@/hooks/useHubLayout";
import { useSiteConfig } from "@/lib/SiteConfigContext";
import { getBuiltin, mergeBuiltin, BTN_SIZE_W } from "@/lib/hubButtons";
import GameCanvas from "@/components/game/GameCanvas";

const STATION_IMG = "/assets/station-hub.png";

const DOCK_ORDER = [
  "hero_ship",
  "galactic_frontier",
  "arena",
  "cantina",
  "bazaar",
  "social",
];

function renderDockButton(id, overrides, delay) {
  const def = getBuiltin(id);
  const c = mergeBuiltin(def, overrides[id]);
  return (
    <StationDockButton
      key={id}
      icon={c.icon}
      label={c.label}
      color={c.color}
      options={c.options}
      delay={delay}
      featured={id === "cantina"}
    />
  );
}

export default function SpaceStationHub({ character, children }) {
  const { user } = useAuth();
  const { customButtons, builtinOverrides } = useHubLayout(user?.id);
  const { theme } = useSiteConfig();
  const stationImg = theme?.station_background || STATION_IMG;

  return (
    <GameCanvas>
      {/* Starfall + station art — cover-scale (never stretch) on ultrawide */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <SpaceBackground />
        <img
          src={stationImg}
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none select-none"
          draggable={false}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/25 to-background/80" />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 70% 55% at 50% 45%, transparent 35%, hsl(232 32% 4% / 0.45) 100%)" }} />
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-background/50 to-transparent pointer-events-none" />
      </div>

      <div className="relative z-10 h-full w-full flex flex-col min-h-0">
        <HubHeader character={character} />

        <div className="relative z-10 flex-1 min-h-0 overflow-hidden flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col">
            <div
              className="mx-auto h-full w-full flex flex-col gap-3 lg:gap-4 min-h-0"
              style={{
                padding: "clamp(0.65rem, 1.2vw, 1.5rem) clamp(0.75rem, 2vw, 2.5rem) clamp(0.65rem, 1vw, 1.1rem)",
              }}
            >
              {/* Open station art */}
              <div className="flex-1 min-h-[6rem]" aria-hidden />

              {/* Optional custom buttons (read-only from HubLayout config) */}
              {customButtons.length > 0 && (
                <div className="shrink-0 flex flex-nowrap items-center justify-center gap-2 sm:gap-3 overflow-x-auto">
                  {customButtons.map((btn) => (
                    <div key={btn.id} className={`${BTN_SIZE_W[btn.size] || "w-40"} shrink-0`}>
                      <StationSplitButton {...btn} delay={0} />
                    </div>
                  ))}
                </div>
              )}

              {/* Bottom dock — equal flex tiles span the full stage width */}
              <nav
                className="shrink-0 w-full flex flex-nowrap items-stretch"
                style={{ gap: "clamp(0.35rem, 0.8vw, 0.85rem)" }}
              >
                {DOCK_ORDER.map((id, i) => renderDockButton(id, builtinOverrides, 0.05 + i * 0.04))}
              </nav>

              {/* Galactic Command Nexus — stays below the destination buttons */}
              {children && (
                <div className="shrink-0 rounded-xl bg-background/90 border border-border/50 p-2.5 shadow-lg">
                  <div className="flex items-center gap-3 overflow-x-auto [&>*]:shrink-0">
                    {children}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </GameCanvas>
  );
}

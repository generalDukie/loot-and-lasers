import React, { useState } from "react";
import StationAmbientToggle from "@/components/game/StationAmbientToggle";
import HubHeader from "@/components/game/HubHeader";
import StationSplitButton from "@/components/game/StationSplitButton";
import StationDockButton from "@/components/game/StationDockButton";
import CommandHubMedallion from "@/components/game/CommandHubMedallion";
import { useAuth } from "@/lib/AuthContext";
import { useHubLayout } from "@/hooks/useHubLayout";
import { useSiteConfig } from "@/lib/SiteConfigContext";
import HubAdminTools from "@/components/game/HubAdminTools";
import HubButtonEditor from "@/components/game/HubButtonEditor";
import { BUILTIN_BUTTONS, getBuiltin, mergeBuiltin, BTN_SIZE_W } from "@/lib/hubButtons";
import GameCanvas from "@/components/game/GameCanvas";

const STATION_IMG = "/assets/station-hub.png";

const DOCK_ORDER = [
  "cantina",
  "galactic_frontier",
  "arena",
  "hero_ship",
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
      featured={id === "hero_ship"}
    />
  );
}

export default function SpaceStationHub({ character, children }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const {
    customButtons,
    builtinOverrides,
    addCustomButton,
    updateCustomButton,
    removeCustomButton,
    updateBuiltin,
    resetBuiltin,
  } = useHubLayout(user?.id);
  const { theme } = useSiteConfig();
  const stationImg = theme?.station_background || STATION_IMG;
  const [editorOpen, setEditorOpen] = useState(false);

  const commandDef = mergeBuiltin(getBuiltin("command_hub"), builtinOverrides.command_hub);

  return (
    <GameCanvas>
      {/* Full-screen station background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${stationImg})` }} />
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/25 to-background/80" />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 70% 55% at 50% 45%, transparent 35%, hsl(232 32% 4% / 0.45) 100%)" }} />
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-background/50 to-transparent pointer-events-none" />
      </div>

      <div className="relative z-10 h-full w-full flex flex-col min-h-0">
        <HubHeader
          character={character}
          rightExtras={isAdmin ? <HubAdminTools onManageButtons={() => setEditorOpen(true)} /> : null}
        />

        <div className="relative z-10 flex-1 min-h-0 overflow-hidden flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col">
            <div className="mx-auto h-full w-full max-w-[1600px] px-3 sm:px-5 lg:px-8 pt-3 sm:pt-4 lg:pt-6 pb-3 sm:pb-4 flex flex-col gap-3 lg:gap-4 min-h-0">
              {/* Open station art */}
              <div className="flex-1 min-h-[6rem]" aria-hidden />

              {/* Optional custom buttons */}
              {customButtons.length > 0 && (
                <div className="shrink-0 flex flex-nowrap items-center justify-center gap-2 sm:gap-3 overflow-x-auto">
                  {customButtons.map((btn) => (
                    <div key={btn.id} className={`${BTN_SIZE_W[btn.size] || "w-40"} shrink-0`}>
                      <StationSplitButton {...btn} delay={0} />
                    </div>
                  ))}
                </div>
              )}

              {/* Command hub — centered, just above the destination dock */}
              <div className="shrink-0 flex justify-center">
                <CommandHubMedallion
                  icon={commandDef.icon}
                  color={commandDef.color}
                  to={commandDef.options[0]?.to}
                  delay={0.1}
                />
              </div>

              {/* Bottom dock — compact tiles, one unbroken row, Crew Quarters center */}
              <nav className="shrink-0 w-full flex flex-nowrap items-stretch gap-1.5 sm:gap-2 lg:gap-3">
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

          <div className="hidden lg:block absolute bottom-4 left-4 z-20 rounded-lg bg-background/85 border border-border/50 overflow-hidden">
            <StationAmbientToggle />
          </div>
        </div>
      </div>

      {isAdmin && (
        <HubButtonEditor
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          buttons={customButtons}
          onAdd={addCustomButton}
          onUpdate={updateCustomButton}
          onRemove={removeCustomButton}
          builtinButtons={BUILTIN_BUTTONS}
          builtinOverrides={builtinOverrides}
          onUpdateBuiltin={updateBuiltin}
          onResetBuiltin={resetBuiltin}
        />
      )}
    </GameCanvas>
  );
}

import React, { useState } from "react";
import { FUEL_MAX, FUEL_PURCHASE_AMOUNT, FUEL_PURCHASE_COST, FUEL_PURCHASE_MAX, FUEL_COLOR, formatFuelAmount } from "@/lib/gameData";
import MissionCard from "@/components/game/MissionCard";
import MissionCantina from "@/components/game/MissionCantina";
import MissionExploreBackdrop from "@/components/game/MissionExploreBackdrop";
import MissionLaunchOverlay from "@/components/game/MissionLaunchOverlay";
import MissionCompleteOverlay from "@/components/game/MissionCompleteOverlay";
import LevelUpOverlay, { pendingLevelUpFromSummary } from "@/components/game/LevelUpOverlay";
import ArenaBattleOverlay from "@/components/game/ArenaBattleOverlay";
import CantinaMusicToggle from "@/components/game/CantinaMusicToggle";
import { useMissionManager } from "@/hooks/useMissionManager";
import { Map, Rocket, Fuel, Backpack } from "lucide-react";
import GameplayOverlayPortal from "@/components/game/GameplayOverlayPortal";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function MissionsPage() {
  const {
    character,
    activeMission,
    launchAnim,
    loading,
    claiming,
    completeSummary,
    missionBattle,
    skipCost,
    gains,
    currentFuel,
    cantinaMissions,
    handleStart,
    handleClaim,
    finishMissionBattle,
    handleSkip,
    handleBuyFuel,
    setCompleteSummary,
    setLaunchAnim,
    inventoryFullOpen,
    setInventoryFullOpen,
    navigate,
  } = useMissionManager();

  const [levelUp, setLevelUp] = useState(null);

  function dismissMissionComplete() {
    const pending = pendingLevelUpFromSummary(completeSummary);
    setCompleteSummary(null);
    if (pending) setLevelUp(pending);
  }

  if (loading || !character) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const maxFuel = character.max_fuel || FUEL_MAX;
  const fuelNow = character.fuel ?? 0;
  const tankTooFull = fuelNow > maxFuel - FUEL_PURCHASE_AMOUNT;
  const outOfFuelBuys = (character.fuel_purchases || 0) >= FUEL_PURCHASE_MAX;
  const buyFuelDisabled = outOfFuelBuys || tankTooFull;
  const buyFuelTitle = outOfFuelBuys
    ? "No refuels left this cycle"
    : tankTooFull
      ? `Need ${maxFuel - FUEL_PURCHASE_AMOUNT} fuel or less to buy +${FUEL_PURCHASE_AMOUNT}`
      : `Buy ${FUEL_PURCHASE_AMOUNT} fuel for ${FUEL_PURCHASE_COST} 💎 (${FUEL_PURCHASE_MAX - (character.fuel_purchases || 0)} left)`;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
      {inventoryFullOpen && (
        <GameplayOverlayPortal
          className="z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setInventoryFullOpen(false)}
        >
          <div
            role="alertdialog"
            aria-labelledby="mission-inv-full-title"
            aria-describedby="mission-inv-full-desc"
            className="painted-panel border border-amber-400/40 max-w-md w-full p-6 shadow-lg grid gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col space-y-2 text-left">
              <h2
                id="mission-inv-full-title"
                className="font-display font-bold text-lg text-amber-300 tracking-wide flex items-center gap-2"
              >
                <Backpack className="w-5 h-5" />
                INVENTORY FULL
              </h2>
              <p id="mission-inv-full-desc" className="text-sm text-muted-foreground">
                Your bag is at capacity. Clear inventory space before starting a mission so loot has somewhere to go.
              </p>
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-0 sm:space-x-2">
              <button
                type="button"
                onClick={() => setInventoryFullOpen(false)}
                className={cn(buttonVariants({ variant: "outline" }), "mt-2 sm:mt-0")}
              >
                Got it
              </button>
              <button
                type="button"
                onClick={() => {
                  setInventoryFullOpen(false);
                  navigate("/character");
                }}
                className={buttonVariants()}
              >
                Open Inventory
              </button>
            </div>
          </div>
        </GameplayOverlayPortal>
      )}

      {missionBattle && (
        <ArenaBattleOverlay
          player={character}
          opponent={missionBattle.enemy}
          battle={missionBattle.battle}
          onDone={finishMissionBattle}
          playerItems={missionBattle.playerItems}
        />
      )}
      {completeSummary && (
        <MissionCompleteOverlay summary={completeSummary} onClose={dismissMissionComplete} />
      )}
      {levelUp && (
        <LevelUpOverlay
          open
          fromLevel={levelUp.fromLevel}
          toLevel={levelUp.toLevel}
          character={character}
          onConfirm={() => setLevelUp(null)}
        />
      )}

      <div className="shrink-0 flex flex-wrap items-center gap-2 justify-between">
        <h1 className="font-display font-bold text-xl tracking-wider flex items-center gap-2">
          <Map className="w-5 h-5 text-primary" /> Missions
          {activeMission && (
            <span className="text-xs bg-primary/10 text-primary px-3 py-1 rounded-full font-medium font-body normal-case tracking-normal">
              <Rocket className="w-3 h-3 inline mr-1" /> On Mission
            </span>
          )}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <CantinaMusicToggle />
          <span
            className="text-xs px-3 py-1 rounded-full font-medium flex items-center gap-1"
            style={{ color: FUEL_COLOR, backgroundColor: `${FUEL_COLOR}18`, border: `1px solid ${FUEL_COLOR}40` }}
          >
            <Fuel className="w-3 h-3" /> {formatFuelAmount(character.fuel ?? FUEL_MAX)}/{character.max_fuel || FUEL_MAX}
          </span>
          <button
            onClick={handleBuyFuel}
            disabled={buyFuelDisabled}
            title={buyFuelTitle}
            className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-medium flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/20 transition-colors"
          >
            +{FUEL_PURCHASE_AMOUNT} · {FUEL_PURCHASE_COST}💎 ({FUEL_PURCHASE_MAX - (character.fuel_purchases || 0)})
          </button>
        </div>
      </div>

      {character.mining_end_time && (
        <div className="shrink-0 flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5">
          <span className="text-xl">⛏️</span>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-sm text-amber-300">Ship Deployed — Mining</p>
            <p className="text-xs text-muted-foreground truncate">Missions unavailable until mining finishes or is cancelled.</p>
          </div>
          <button onClick={() => navigate("/space-mining")} className="text-xs font-display font-semibold text-amber-300 hover:text-amber-200 whitespace-nowrap">View →</button>
        </div>
      )}

      {activeMission && (
        <div className="shrink-0">
          <h2 className="text-[10px] font-display font-semibold text-muted-foreground tracking-wide mb-1">ACTIVE MISSION</h2>
          <MissionCard
            mission={activeMission}
            isActive={activeMission.status === "in_progress"}
            isCompleted={activeMission.status === "completed"}
            characterLevel={character.level}
            character={character}
            onClaim={handleClaim}
            onSkip={handleSkip}
            skipCost={skipCost}
            claiming={claiming}
            previewStardust={gains?.stardustGain}
            previewXp={gains?.xpGain}
          />
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col">
        <h2 className="shrink-0 text-xs font-display font-semibold text-muted-foreground tracking-wide mb-1.5">
          {activeMission ? "OUT ON ASSIGNMENT" : "THE CANTINA"}
        </h2>
        <div className="flex-1 min-h-0">
          {activeMission ? (
            <div className="relative h-full w-full min-h-0">
              <MissionExploreBackdrop
                missionName={activeMission.name}
                sceneIndex={activeMission.explore_scene}
                sceneSeed={activeMission.id || activeMission.name}
              />
              {launchAnim && (
                <MissionLaunchOverlay mission={launchAnim} onDone={() => setLaunchAnim(null)} />
              )}
            </div>
          ) : (
            <MissionCantina
              missions={cantinaMissions}
              characterLevel={character.level}
              character={character}
              currentFuel={currentFuel}
              onStart={handleStart}
              busy={!!character.mining_end_time}
              mining={!!character.mining_end_time}
            />
          )}
        </div>
      </div>
    </div>
  );
}

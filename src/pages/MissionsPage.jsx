import React from "react";
import { FUEL_MAX, FUEL_PURCHASE_AMOUNT, FUEL_PURCHASE_COST, FUEL_PURCHASE_MAX } from "@/lib/gameData";
import MissionCard from "@/components/game/MissionCard";
import MissionCantina from "@/components/game/MissionCantina";
import MissionExploreBackdrop from "@/components/game/MissionExploreBackdrop";
import MissionLaunchOverlay from "@/components/game/MissionLaunchOverlay";
import MissionCompleteOverlay from "@/components/game/MissionCompleteOverlay";
import ArenaBattleOverlay from "@/components/game/ArenaBattleOverlay";
import CantinaMusicToggle from "@/components/game/CantinaMusicToggle";
import { useMissionManager } from "@/hooks/useMissionManager";
import { Map, Rocket, Fuel } from "lucide-react";

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
    navigate,
  } = useMissionManager();

  if (loading || !character) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
      {launchAnim && <MissionLaunchOverlay mission={launchAnim} onDone={() => setLaunchAnim(null)} />}
      {missionBattle && (
        <ArenaBattleOverlay
          player={character}
          opponent={missionBattle.enemy}
          battle={missionBattle.battle}
          onDone={finishMissionBattle}
          playerItems={missionBattle.playerItems}
        />
      )}
      {completeSummary && <MissionCompleteOverlay summary={completeSummary} onClose={() => setCompleteSummary(null)} />}

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
          <span className="text-xs bg-amber-500/10 text-amber-400 px-3 py-1 rounded-full font-medium flex items-center gap-1">
            <Fuel className="w-3 h-3" /> {character.fuel ?? FUEL_MAX}/{character.max_fuel || FUEL_MAX}
          </span>
          <button
            onClick={handleBuyFuel}
            disabled={(character.fuel_purchases || 0) >= FUEL_PURCHASE_MAX}
            title={(character.fuel_purchases || 0) >= FUEL_PURCHASE_MAX ? "No refuels left this cycle" : `Buy ${FUEL_PURCHASE_AMOUNT} fuel for ${FUEL_PURCHASE_COST} 💎 (${FUEL_PURCHASE_MAX - (character.fuel_purchases || 0)} left)`}
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
            <MissionExploreBackdrop
              missionName={activeMission.name}
              sceneIndex={activeMission.explore_scene}
            />
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

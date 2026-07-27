import React from "react";
import { FUEL_MAX, FUEL_PURCHASE_AMOUNT, FUEL_PURCHASE_COST, FUEL_PURCHASE_MAX } from "@/lib/gameData";
import MissionCard from "@/components/game/MissionCard";
import MissionCantina from "@/components/game/MissionCantina";
import MissionLaunchOverlay from "@/components/game/MissionLaunchOverlay";
import MissionCompleteOverlay from "@/components/game/MissionCompleteOverlay";
import CantinaMusicToggle from "@/components/game/CantinaMusicToggle";
import { useMissionManager } from "@/hooks/useMissionManager";
import { Map, Rocket, Fuel, Shuffle } from "lucide-react";

export default function MissionsPage() {
  const {
    character,
    dailyMissions,
    activeMission,
    launchAnim,
    loading,
    claiming,
    completeSummary,
    skipCost,
    gains,
    currentFuel,
    cantinaMissions,
    handleStart,
    handleClaim,
    handleSkip,
    handleBuyFuel,
    shuffleMissions,
    setCompleteSummary,
    setLaunchAnim,
    navigate,
  } = useMissionManager();

  if (loading || !character) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {launchAnim && <MissionLaunchOverlay mission={launchAnim} onDone={() => setLaunchAnim(null)} />}
      {completeSummary && <MissionCompleteOverlay summary={completeSummary} onClose={() => setCompleteSummary(null)} />}

      <div className="flex items-center justify-between">
        <h1 className="font-display font-bold text-xl tracking-wider flex items-center gap-2">
          <Map className="w-5 h-5 text-primary" /> Missions
        </h1>
        {activeMission && (
          <span className="text-xs bg-primary/10 text-primary px-3 py-1 rounded-full font-medium">
            <Rocket className="w-3 h-3 inline mr-1" /> On Mission
          </span>
        )}
        <CantinaMusicToggle />
        <button
          onClick={shuffleMissions}
          className="text-xs bg-accent/10 text-accent px-3 py-1 rounded-full font-medium flex items-center gap-1 hover:bg-accent/20 transition-colors"
        >
          <Shuffle className="w-3 h-3" /> Shuffle
        </button>
        <div className="flex items-center gap-2">
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

      {/* Mining occupation notice */}
      {character.mining_end_time && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <span className="text-xl">⛏️</span>
          <div className="flex-1">
            <p className="font-display font-bold text-sm text-amber-300">Ship Deployed — Mining</p>
            <p className="text-xs text-muted-foreground">Your ship is busy mining a stardust node. Missions are unavailable until you finish or cancel mining.</p>
          </div>
          <button onClick={() => navigate("/space-mining")} className="text-xs font-display font-semibold text-amber-300 hover:text-amber-200 whitespace-nowrap">View →</button>
        </div>
      )}

      {/* Active Mission */}
      {activeMission && (
        <div>
          <h2 className="text-xs font-display font-semibold text-muted-foreground tracking-wide mb-2">ACTIVE MISSION</h2>
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

      {/* Cantina — quest-giving patrons */}
      <div>
        <h2 className="text-xs font-display font-semibold text-muted-foreground tracking-wide mb-3">
          {activeMission ? "THE CANTINA" : "THE CANTINA"}
        </h2>
        <MissionCantina
          missions={cantinaMissions}
          characterLevel={character.level}
          character={character}
          currentFuel={currentFuel}
          onStart={handleStart}
          busy={!!activeMission || !!character.mining_end_time}
          mining={!!character.mining_end_time && !activeMission}
        />
      </div>
    </div>
  );
}
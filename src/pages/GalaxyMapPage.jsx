import React, { useState, useEffect, useCallback } from "react";
import { api } from "@/api/gameClient";
import { trackNovaSpend } from "@/lib/novaTracker";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { getInstalledMods, getStatPointsForLevelRange } from "@/lib/gameData";
import { DUNGEON_PLANETS, getInfinitePlanet, getDungeonPlanetById, WORMHOLE_ID, getWormholePlanet } from "@/lib/dungeonData";
import {
  DUNGEON_ENEMIES_PER_PLANET,
  DUNGEON_BATTLE_COOLDOWN_MS, DUNGEON_SKIP_COST,
  isDungeonUnlockedByLevel, getDungeonUnlockLevel,
} from "@/lib/dungeonEngine";
import { processDiscovery } from "@/lib/discovery";
import { applyPendingLootFromResponse } from "@/lib/inventoryCap";
import { toastNewAchievements } from "@/lib/achievementToasts";
import { getCollectionStats } from "@/lib/collectionBonus";
import { getMyCharacter, primeMyCharacterCache } from "@/lib/socialEngine";
import DungeonMap from "@/components/game/DungeonMap";
import DungeonPlanetView from "@/components/game/DungeonPlanetView";
import ArenaBattleOverlay from "@/components/game/ArenaBattleOverlay";
import CombatCompleteOverlay from "@/components/game/CombatCompleteOverlay";
import LevelUpOverlay, { pendingLevelUpFromSummary } from "@/components/game/LevelUpOverlay";
import { Satellite, Rocket } from "lucide-react";

export default function GalaxyMapPage() {
  const [character, setCharacterState] = useState(null);
  const [equippedItems, setEquippedItems] = useState([]);
  const [battleState, setBattleState] = useState(null);
  const [completeSummary, setCompleteSummary] = useState(null);
  const [levelUp, setLevelUp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [selectedPlanetId, setSelectedPlanetId] = useState(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const setCharacter = useCallback((next) => {
    setCharacterState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      if (value) primeMyCharacterCache(value);
      return value;
    });
  }, []);

  const load = useCallback(async () => {
    const char = await getMyCharacter({ force: true });
    if (!char) { navigate("/create-character"); return; }
    try {
      const sync = await api.functions.invoke("SyncDungeonState", {});
      const synced = sync.character || sync.data?.character;
      const patch = sync.patch || sync.data?.patch;
      const dungeon = sync.dungeon || sync.data?.dungeon;
      if (synced) Object.assign(char, synced);
      else if (patch) Object.assign(char, patch);
      if (dungeon) {
        if (dungeon.dungeon_cooldown_until) char.dungeon_cooldown_until = dungeon.dungeon_cooldown_until;
        if (dungeon.dungeon_cooldown_at) char.dungeon_cooldown_at = dungeon.dungeon_cooldown_at;
        if (dungeon.dungeon_cooldown_ms != null) char.dungeon_cooldown_ms = dungeon.dungeon_cooldown_ms;
      }
    } catch (e) { /* non-blocking */ }
    setCharacter(char);
    setSelectedPlanetId(null);
    setLoading(false);
    try { setEquippedItems((await api.entities.Item.filter({ character_id: char.id, is_equipped: true })) || []); } catch (e) {}
  }, [navigate, setCharacter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const rawPlanet = Math.max(1, character?.dungeon_planet || 1);
  const inInfinite = rawPlanet > DUNGEON_PLANETS.length;
  const infiniteDepth = inInfinite ? rawPlanet - DUNGEON_PLANETS.length : 1;
  const storyPlanetId = inInfinite ? DUNGEON_PLANETS.length : Math.min(DUNGEON_PLANETS.length, rawPlanet);

  const effectiveSelection = selectedPlanetId ?? (inInfinite ? WORMHOLE_ID : storyPlanetId);
  const viewingWormhole = effectiveSelection === WORMHOLE_ID;
  const patrol = typeof effectiveSelection === "number"
    && effectiveSelection >= 1
    && effectiveSelection <= DUNGEON_PLANETS.length
    && (inInfinite || effectiveSelection < rawPlanet);

  const planet = viewingWormhole
    ? getWormholePlanet(infiniteDepth)
    : getDungeonPlanetById(effectiveSelection);

  const crawlEnemyIndex = Math.min(DUNGEON_ENEMIES_PER_PLANET, Math.max(1, character?.dungeon_enemy || 1));
  const realMods = character ? getInstalledMods(character).length : 0;
  const flavorMods = character?.ship_mods || [];
  const cdUntil = character?.dungeon_cooldown_until
    ? new Date(character.dungeon_cooldown_until).getTime()
    : 0;
  const cdMs = character?.dungeon_cooldown_ms ?? DUNGEON_BATTLE_COOLDOWN_MS;
  const cooldownEnds = cdUntil > 0
    ? cdUntil
    : (character?.dungeon_cooldown_at
      ? new Date(character.dungeon_cooldown_at).getTime() + cdMs
      : 0);
  const cooldownActive = now < cooldownEnds;

  async function skipCooldown() {
    if (!cooldownActive) {
      toast({ title: "No cooldown", description: "Nothing to skip right now." });
      return;
    }
    if ((character.nova_crystals || 0) < DUNGEON_SKIP_COST) {
      toast({ title: "Not enough Nova Crystals", description: `Skip costs ${DUNGEON_SKIP_COST} 💎.`, variant: "destructive" });
      return;
    }
    try {
      const res = await api.functions.invoke("SkipDungeonCooldown", {});
      const upd = res.patch || res.data?.patch || {};
      const dungeon = res.dungeon || res.data?.dungeon || {};
      setCharacter((c) => ({
        ...c,
        ...upd,
        dungeon_cooldown_until: dungeon.dungeon_cooldown_until ?? null,
        dungeon_cooldown_at: dungeon.dungeon_cooldown_at ?? null,
        dungeon_cooldown_ms: dungeon.dungeon_cooldown_ms ?? null,
      }));
      void trackNovaSpend(character, DUNGEON_SKIP_COST, "dungeon_skip");
    } catch (e) {
      toast({ title: "Could not skip", description: e?.message || "Try again.", variant: "destructive" });
    }
  }

  async function handleFight() {
    if (!character || battleState) return;
    if (!viewingWormhole && planet?.id >= 1 && planet.id <= DUNGEON_PLANETS.length) {
      if (!isDungeonUnlockedByLevel(planet.id, character.level)) {
        const need = getDungeonUnlockLevel(planet.id);
        toast({
          title: "Dungeon locked",
          description: `Reach level ${need} to attempt this world.`,
          variant: "destructive",
        });
        return;
      }
    }
    if (cooldownActive) {
      toast({ title: "Battle Cooldown", description: `Wait or skip with ${DUNGEON_SKIP_COST} 💎.`, variant: "destructive" });
      return;
    }

    let fightIndex = crawlEnemyIndex;
    if (patrol) {
      fightIndex = Math.random() < 0.1 ? DUNGEON_ENEMIES_PER_PLANET : 1 + Math.floor(Math.random() * (DUNGEON_ENEMIES_PER_PLANET - 1));
    }

    const fightPlanet = viewingWormhole ? getInfinitePlanet(infiniteDepth) : planet;
    let prep;
    try {
      prep = await api.functions.invoke("PrepareDungeonCombat", {
        planet_id: fightPlanet.id,
        enemy_index: fightIndex,
        patrol,
        viewing_wormhole: viewingWormhole,
      });
    } catch (e) {
      toast({ title: "Battle failed to start", description: e?.message || "Try again.", variant: "destructive" });
      return;
    }
    const data = prep?.data || prep || {};
    if (data.character) setCharacter((c) => ({ ...c, ...data.character }));
    if (data.dungeon) {
      setCharacter((c) => ({
        ...c,
        dungeon_cooldown_until: data.dungeon.dungeon_cooldown_until ?? c.dungeon_cooldown_until,
        dungeon_cooldown_at: data.dungeon.dungeon_cooldown_at ?? c.dungeon_cooldown_at,
        dungeon_cooldown_ms: data.dungeon.dungeon_cooldown_ms ?? c.dungeon_cooldown_ms,
      }));
    }
    const enemy = data.enemy || {};
    const battle = data.battle || {
      winner: data.winner,
      events: data.events || [],
      playerMaxHp: data.playerMaxHp,
      opponentMaxHp: data.opponentMaxHp,
      initiativeFirstSide: data.opening_side,
      playerEnd: data.playerEnd,
      opponentEnd: data.opponentEnd,
    };
    setBattleState({
      enemy,
      battle,
      rewards: null,
      enemyIndex: data.enemy_index || fightIndex,
      patrol,
      planet: viewingWormhole ? getWormholePlanet(infiniteDepth) : fightPlanet,
      viewingWormhole,
      combat_id: data.combat_id,
    });
  }

  async function finishBattle() {
    const { enemy, battle, enemyIndex: fightIndex, patrol: wasPatrol, planet: fightPlanet, viewingWormhole: wasWormhole } = battleState;
    const won = battle.winner === "player";
    const prevLevel = character.level;
    let collectPct = 0;
    ({ percentage: collectPct } = getCollectionStats(character));

    let res;
    try {
      res = await api.functions.invoke("FinishDungeonBattle", {
        planet_id: fightPlanet.id,
        enemy_index: fightIndex,
        patrol: wasPatrol,
        viewing_wormhole: wasWormhole,
        combat_id: battleState.combat_id,
      });
    } catch (e) {
      toast({ title: "Settle failed", description: e?.message || "Try again.", variant: "destructive" });
      setBattleState(null);
      return;
    }

    const data = res?.data || res || {};
    const update = data.patch || {};
    const fullChar = data.character;
    const dungeonMeta = data.dungeon || {};
    const serverRewards = data.rewards || data.receipt?.rewards || {};
    const gearItem = data.gear || data.items?.[0] || null;
    const unlockedShipMod = data.ship_mod || data.unlockedShipMod || null;
    const droppedConsumable = data.consumable || null;
    const milestoneItem = data.milestone_item || null;
    const boostedXp = serverRewards.experience || 0;
    const newLevel = fullChar?.level || update.level || character.level;
    await applyPendingLootFromResponse(data);
    toastNewAchievements(data);

    const defeatNote = won ? "" : "No rewards on defeat.";

    const isBoss = !!(enemy.isBoss || enemy.boss || serverRewards.isBoss || fightIndex === DUNGEON_ENEMIES_PER_PLANET);

    const { found: discFound } = processDiscovery(character, { win: won, speciesId: battleState.enemy.speciesId });
    setCharacter((c) => ({
      ...c,
      ...(fullChar || update),
      ...dungeonMeta,
      dungeon_cooldown_until: dungeonMeta.dungeon_cooldown_until ?? c.dungeon_cooldown_until,
      dungeon_cooldown_at: dungeonMeta.dungeon_cooldown_at ?? c.dungeon_cooldown_at,
      dungeon_cooldown_ms: dungeonMeta.dungeon_cooldown_ms ?? c.dungeon_cooldown_ms,
    }));
    setBattleState(null);
    if (!wasPatrol && won && isBoss) {
      if (fightPlanet.id === DUNGEON_PLANETS.length) setSelectedPlanetId(WORMHOLE_ID);
      else if (!wasWormhole) setSelectedPlanetId(null);
    }

    setCompleteSummary({
      mode: "dungeon",
      won,
      title: won
        ? (wasPatrol
            ? `Patrolled — defeated ${enemy.name}`
            : (isBoss ? `Defeated ${enemy.name}` : `Cleared enemy ${fightIndex}`))
        : `Fell to ${enemy.name}`,
      subtitle: `${fightPlanet.name}${isBoss ? " · Boss" : ""}${wasPatrol ? " · Patrol" : ""}`,
      xp: boostedXp > 0 ? { base: serverRewards.base_experience || 0, collectionPct: collectPct, total: boostedXp } : undefined,
      stardust: won ? { total: serverRewards.stardust ?? 0 } : undefined,
      leveledUp: newLevel > prevLevel,
      prevLevel,
      newLevel,
      statPoints: getStatPointsForLevelRange(prevLevel, newLevel),
      gearItem: gearItem || undefined,
      shipMod: unlockedShipMod || undefined,
      consumableItem: droppedConsumable || undefined,
      discoveries: discFound,
      note: defeatNote || (milestoneItem ? `Milestone chest: ${milestoneItem.name}` : undefined),
    });
  }

  if (loading || !character) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const displayEnemy = patrol ? 1 : crawlEnemyIndex;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
      {battleState && (
        <ArenaBattleOverlay
          player={character}
          opponent={battleState.enemy}
          battle={battleState.battle}
          onDone={finishBattle}
          playerItems={equippedItems}
          theme={{
            color: battleState.planet?.color || planet.color,
            label: `${battleState.planet?.icon || planet.icon} ${battleState.planet?.name || planet.name}${battleState.patrol ? " · Patrol" : ""}`,
          }}
        />
      )}
      {completeSummary && (
        <CombatCompleteOverlay
          summary={completeSummary}
          onClose={() => {
            const pending = pendingLevelUpFromSummary(completeSummary);
            setCompleteSummary(null);
            if (pending) setLevelUp(pending);
          }}
        />
      )}
      {levelUp && (
        <LevelUpOverlay
          open
          fromLevel={levelUp.fromLevel}
          toLevel={levelUp.toLevel}
          character={character}
          attributeAwards={levelUp.attributeAwards}
          onConfirm={() => setLevelUp(null)}
        />
      )}

      <div className="shrink-0 flex items-center justify-between flex-wrap gap-2">
        <div className="min-w-0">
          <h1 className="font-display font-bold text-xl tracking-wider flex items-center gap-2">
            <Satellite className="w-5 h-5 text-primary" /> Galactic Frontier
          </h1>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            1 hour cooldown, skip for {DUNGEON_SKIP_COST} 💎
            {inInfinite ? ` · Wormhole depth ${infiniteDepth}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1 text-accent" title="Active ship mod tiers / catalogued frontier relics">
            <Rocket className="w-3.5 h-3.5" /> {realMods} mods{flavorMods.length ? ` · ${flavorMods.length} relics` : ""}
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-row gap-2 sm:gap-3 overflow-hidden">
        <div className="relative z-0 flex-[1.85] min-w-0 min-h-0 flex flex-col overflow-hidden isolate">
          <DungeonMap
            fill
            planets={DUNGEON_PLANETS}
            storyPlanetId={storyPlanetId}
            inInfinite={inInfinite}
            infiniteDepth={infiniteDepth}
            selectedId={effectiveSelection}
            onSelect={(id) => setSelectedPlanetId(id)}
            playerLevel={character?.level || 1}
          />
        </div>

        <div className="relative z-10 flex-[0_0_clamp(260px,28cqi,440px)] min-w-0 min-h-0 flex flex-col overflow-hidden isolate">
          <DungeonPlanetView
            planet={planet}
            currentEnemy={displayEnemy}
            onFight={handleFight}
            cooldownActive={cooldownActive}
            cooldownRemaining={cooldownEnds - now}
            cooldownSkipCost={DUNGEON_SKIP_COST}
            onSkipCooldown={skipCooldown}
            patrol={patrol}
            onReturnToFront={() => setSelectedPlanetId(inInfinite ? WORMHOLE_ID : null)}
          />
        </div>
      </div>
    </div>
  );
}

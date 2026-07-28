import React, { useState, useEffect, useCallback } from "react";
import { api } from "@/api/gameClient";
import { trackNovaSpend } from "@/lib/novaTracker";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { getExpForLevel, randomConsumable, consumableItem, getInstalledMods, getStatPointsForLevelRange } from "@/lib/gameData";
import { simulateBattle } from "@/lib/arenaEngine";
import { DUNGEON_PLANETS, getInfinitePlanet, getDungeonPlanetById, WORMHOLE_ID, getWormholePlanet } from "@/lib/dungeonData";
import {
  DUNGEON_ENEMIES_PER_PLANET, DUNGEON_DEATHS_PER_DAY, DUNGEON_CONTINUE_COST,
  DUNGEON_BATTLE_COOLDOWN_MS, DUNGEON_SKIP_COST, DUNGEON_WIN_COOLDOWN_MS, DUNGEON_LOSS_COOLDOWN_MS,
  generateDungeonEnemy, computeDungeonRewards, dungeonCooldownMs, rollMilestoneChest, grantFrontierShipMod,
} from "@/lib/dungeonEngine";
import { processDiscovery } from "@/lib/discovery";
import { addItemWithCap } from "@/lib/inventoryCap";
import { getCollectionStats, applyXpBonus } from "@/lib/collectionBonus";
import { getMyCharacter } from "@/lib/socialEngine";
import DungeonMap from "@/components/game/DungeonMap";
import DungeonPlanetView from "@/components/game/DungeonPlanetView";
import ArenaBattleOverlay from "@/components/game/ArenaBattleOverlay";
import CombatCompleteOverlay from "@/components/game/CombatCompleteOverlay";
import { Satellite, Skull, Rocket } from "lucide-react";
import { progressWeeklyNovaQuest } from "@/lib/weeklyNovaQuests";

import { todayET, msUntilNextETMidnight, formatEtaShort } from "@/lib/gameTime";

export default function GalaxyMapPage() {
  const [character, setCharacter] = useState(null);
  const [equippedItems, setEquippedItems] = useState([]);
  const [battleState, setBattleState] = useState(null);
  const [completeSummary, setCompleteSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [selectedPlanetId, setSelectedPlanetId] = useState(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const load = useCallback(async () => {
    const char = await getMyCharacter();
    if (!char) { navigate("/create-character"); return; }
    try {
      const sync = await api.functions.invoke("SyncDungeonState", {});
      const patch = sync.patch || sync.data?.patch;
      if (patch) Object.assign(char, patch);
    } catch (e) { /* non-blocking */ }
    setCharacter(char);
    setSelectedPlanetId(null);
    setLoading(false);
    try { setEquippedItems((await api.entities.Item.filter({ character_id: char.id, is_equipped: true })) || []); } catch (e) {}
  }, [navigate]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const rawPlanet = Math.max(1, character?.dungeon_planet || 1);
  const inInfinite = rawPlanet > DUNGEON_PLANETS.length;
  const infiniteDepth = inInfinite ? rawPlanet - DUNGEON_PLANETS.length : 1;
  const storyPlanetId = inInfinite ? DUNGEON_PLANETS.length : Math.min(DUNGEON_PLANETS.length, rawPlanet);

  // Default view: wormhole when infinite, otherwise the story front.
  const effectiveSelection = selectedPlanetId ?? (inInfinite ? WORMHOLE_ID : storyPlanetId);
  const viewingWormhole = effectiveSelection === WORMHOLE_ID;
  const patrol = typeof effectiveSelection === "number"
    && effectiveSelection >= 1
    && effectiveSelection <= DUNGEON_PLANETS.length
    && (inInfinite || effectiveSelection < rawPlanet);

  const planet = viewingWormhole
    ? getWormholePlanet(infiniteDepth)
    : getDungeonPlanetById(effectiveSelection);

  // Infinite / story crawl uses dungeon_enemy on the active front.
  const crawlEnemyIndex = Math.min(DUNGEON_ENEMIES_PER_PLANET, Math.max(1, character?.dungeon_enemy || 1));
  const deaths = Math.min(DUNGEON_DEATHS_PER_DAY, character?.dungeon_deaths || 0);
  const deathCap = DUNGEON_DEATHS_PER_DAY;
  const freeLivesLeft = Math.max(0, deathCap - deaths);
  const paidContinue = freeLivesLeft <= 0;
  const realMods = character ? getInstalledMods(character).length : 0;
  const flavorMods = character?.ship_mods || [];
  const cdMs = character?.dungeon_cooldown_ms ?? DUNGEON_BATTLE_COOLDOWN_MS;
  const cooldownEnds = character?.dungeon_cooldown_at
    ? new Date(character.dungeon_cooldown_at).getTime() + cdMs
    : 0;
  const cooldownActive = now < cooldownEnds;

  async function skipCooldown() {
    if ((character.nova_crystals || 0) < DUNGEON_SKIP_COST) {
      toast({ title: "Not enough Nova Crystals", description: `Skip costs ${DUNGEON_SKIP_COST} 💎.`, variant: "destructive" });
      return;
    }
    const res = await api.functions.invoke("SkipDungeonCooldown", {});
    const upd = res.patch || res.data?.patch || {};
    setCharacter((c) => ({ ...c, ...upd }));
    void trackNovaSpend(character, DUNGEON_SKIP_COST, "dungeon_skip");
  }

  async function handleFight() {
    if (!character || battleState) return;
    if (cooldownActive) {
      toast({ title: "Battle Cooldown", description: `Wait or skip with ${DUNGEON_SKIP_COST} 💎.`, variant: "destructive" });
      return;
    }
    if (paidContinue) {
      if ((character.nova_crystals || 0) < DUNGEON_CONTINUE_COST) {
        toast({ title: "Not enough Nova Crystals", description: `Continue costs ${DUNGEON_CONTINUE_COST} 💎.`, variant: "destructive" });
        return;
      }
      const pay = await api.functions.invoke("PayDungeonContinue", {});
      const payPatch = pay.patch || pay.data?.patch || {};
      setCharacter((c) => ({ ...c, ...payPatch }));
      void trackNovaSpend(character, DUNGEON_CONTINUE_COST, "dungeon_continue");
    }

    // Patrol: random regular enemy (1–9), 10% chance of boss rematch.
    // Wormhole / story crawl: fight the current node.
    let fightIndex = crawlEnemyIndex;
    if (patrol) {
      fightIndex = Math.random() < 0.1 ? DUNGEON_ENEMIES_PER_PLANET : 1 + Math.floor(Math.random() * (DUNGEON_ENEMIES_PER_PLANET - 1));
    }

    const fightPlanet = viewingWormhole ? getInfinitePlanet(infiniteDepth) : planet;
    const enemy = generateDungeonEnemy(fightPlanet, fightIndex, character.level);
    const battle = simulateBattle(character, enemy, equippedItems);
    const rewards = computeDungeonRewards(fightPlanet, fightIndex, character.level, battle.winner === "player", { patrol });
    setBattleState({ enemy, battle, rewards, enemyIndex: fightIndex, patrol, planet: viewingWormhole ? getWormholePlanet(infiniteDepth) : fightPlanet, viewingWormhole });
  }

  async function finishBattle() {
    const { enemy, battle, rewards, enemyIndex: fightIndex, patrol: wasPatrol, planet: fightPlanet, viewingWormhole: wasWormhole } = battleState;
    const won = battle.winner === "player";
    const maxPlayerHit = Math.max(0, ...battle.events.filter((e) => e.attacker === "player" && e.damage).map((e) => e.damage));
    const prevLevel = character.level;
    let collectPct = 0;
    ({ percentage: collectPct } = getCollectionStats(character));

    let res;
    try {
      res = await api.functions.invoke("FinishDungeonBattle", {
        won,
        planet_id: fightPlanet.id,
        enemy_index: fightIndex,
        patrol: wasPatrol,
        viewing_wormhole: wasWormhole,
        species_id: enemy.speciesId,
        max_hit: maxPlayerHit,
      });
    } catch (e) {
      toast({ title: "Could not settle dungeon fight", description: e?.message || "Try again.", variant: "destructive" });
      setBattleState(null);
      await load();
      return;
    }
    const update = res.patch || res.data?.patch || {};
    const serverRewards = res.rewards || res.data?.rewards || {};
    const boostedXp = won ? (serverRewards.experience || 0) : 0;
    const newLevel = update.level ?? character.level;
    const unlockedShipMod = null;
    const items = res.items || res.data?.items || [];
    const gearItem = items[0] || null;
    const droppedConsumable = items.find((i) => i.type === "consumable") || null;
    const milestoneItem = items.length > 1 ? items[items.length - 1] : null;
    let defeatNote;
    if (!won) {
      const deathsNow = update.dungeon_deaths ?? (deaths + 1);
      defeatNote = freeLivesLeft > 1
        ? `Death ${deathsNow}/${deathCap}. No rewards on defeat.`
        : freeLivesLeft === 1
        ? `Last free life spent. Further fights cost ${DUNGEON_CONTINUE_COST} 💎.`
        : `Next fight costs ${DUNGEON_CONTINUE_COST} 💎.`;
    }

    if (won) {
      void api.entities.GalaxyNews.create({
        message: wasPatrol
          ? `🛰️ ${character.name} patrolled ${fightPlanet.name} and defeated ${enemy.name}.`
          : rewards.isBoss
          ? `👑 ${character.name} conquered ${fightPlanet.bossName}!`
          : `⚔️ ${character.name} cleared enemy ${fightIndex} on ${fightPlanet.name}.`,
        entry_type: "victory",
        character_name: character.name,
        character_id: character.id,
      });
    } else {
      void api.entities.GalaxyNews.create({
        message: `💀 ${character.name} fell to ${enemy.name} on ${fightPlanet.name}.`,
        entry_type: "defeat",
        character_name: character.name,
        character_id: character.id,
      });
    }

    const { found: discFound } = processDiscovery(character, { win: won, speciesId: battleState.enemy.speciesId });
    setCharacter((c) => ({ ...c, ...update }));
    setBattleState(null);
    if (!wasPatrol && won && rewards.isBoss) {
      if (fightPlanet.id === DUNGEON_PLANETS.length) setSelectedPlanetId(WORMHOLE_ID);
      else if (!wasWormhole) setSelectedPlanetId(null);
    }

    setCompleteSummary({
      mode: "dungeon",
      won,
      title: won
        ? (wasPatrol
            ? `Patrolled — defeated ${enemy.name}`
            : (rewards.isBoss ? `Defeated ${enemy.name}` : `Cleared enemy ${fightIndex}`))
        : `Fell to ${enemy.name}`,
      subtitle: `${fightPlanet.name}${rewards.isBoss ? " · Boss" : ""}${wasPatrol ? " · Patrol" : ""}`,
      xp: boostedXp > 0 ? { base: serverRewards.base_experience || rewards.experience || 0, collectionPct: collectPct, total: boostedXp } : undefined,
      stardust: won ? { total: serverRewards.stardust ?? rewards.stardust ?? 0 } : undefined,
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

  if (loading) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!character) return null;

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
        <CombatCompleteOverlay summary={completeSummary} onClose={() => setCompleteSummary(null)} />
      )}

      <div className="shrink-0 flex items-center justify-between flex-wrap gap-2">
        <div className="min-w-0">
          <h1 className="font-display font-bold text-xl tracking-wider flex items-center gap-2">
            <Satellite className="w-5 h-5 text-primary" /> Galactic Frontier
          </h1>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Cooldown: {Math.round(DUNGEON_WIN_COOLDOWN_MS / 60000)}m wins · {Math.round(DUNGEON_LOSS_COOLDOWN_MS / 60000)}m losses
            {inInfinite ? ` · Wormhole depth ${infiniteDepth}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex flex-col items-end gap-0.5" title="Free lives today (ET midnight). After these, fights cost Nova Crystals.">
            <span className="flex items-center gap-1.5">
              {Array.from({ length: DUNGEON_DEATHS_PER_DAY }).map((_, i) => (
                <Skull key={i} className={`w-4 h-4 ${i < freeLivesLeft ? "text-red-400" : "text-muted/30"}`} />
              ))}
              <span className="text-muted-foreground ml-1">
                {freeLivesLeft > 0 ? `${freeLivesLeft} left` : "0 left · paid"}
              </span>
            </span>
            <span className="text-[9px] text-muted-foreground/80 font-display tracking-wide">
              resets {formatEtaShort(msUntilNextETMidnight(now))}
            </span>
          </span>
          <span className="flex items-center gap-1 text-accent" title="Active ship mod tiers / catalogued frontier relics">
            <Rocket className="w-3.5 h-3.5" /> {realMods} mods{flavorMods.length ? ` · ${flavorMods.length} relics` : ""}
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-row gap-2 sm:gap-3 overflow-hidden">
        {/* Map stays under the planet pane so spiral nodes can't steal Fight clicks */}
        <div className="relative z-0 flex-[1.85] min-w-0 min-h-0 flex flex-col overflow-hidden isolate">
          <DungeonMap
            fill
            planets={DUNGEON_PLANETS}
            storyPlanetId={storyPlanetId}
            inInfinite={inInfinite}
            infiniteDepth={infiniteDepth}
            selectedId={effectiveSelection}
            onSelect={(id) => setSelectedPlanetId(id)}
          />
        </div>

        <div className="relative z-10 flex-[0_0_clamp(260px,28vw,440px)] min-w-0 min-h-0 flex flex-col overflow-hidden isolate">
          <DungeonPlanetView
            planet={planet}
            currentEnemy={displayEnemy}
            paidContinue={paidContinue}
            continueCost={DUNGEON_CONTINUE_COST}
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

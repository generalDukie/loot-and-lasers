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

import { todayET } from "@/lib/gameTime";

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
    const today = todayET();
    if (char.dungeon_deaths_date !== today) {
      try { await api.entities.Character.update(char.id, { dungeon_deaths: 0, dungeon_deaths_date: today, dungeon_extra_lives: 0 }); } catch (e) {}
      char.dungeon_deaths = 0;
      char.dungeon_deaths_date = today;
      char.dungeon_extra_lives = 0;
    }
    if ((char.ship_mods || []).includes("Genesis Core") && (char.dungeon_planet || 1) <= 10) {
      try { await api.entities.Character.update(char.id, { dungeon_planet: 11, dungeon_enemy: 1 }); } catch (e) {}
      char.dungeon_planet = 11;
      char.dungeon_enemy = 1;
    }
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
    const upd = { nova_crystals: (character.nova_crystals || 0) - DUNGEON_SKIP_COST, dungeon_cooldown_at: null, dungeon_cooldown_ms: null };
    await api.entities.Character.update(character.id, upd);
    setCharacter((c) => ({ ...c, ...upd }));
    void trackNovaSpend(character, DUNGEON_SKIP_COST, "dungeon_skip");
  }

  async function handleFight() {
    if (!character || battleState) return;
    if (cooldownActive) {
      toast({ title: "Battle Cooldown", description: `Wait or skip with ${DUNGEON_SKIP_COST} 💎.`, variant: "destructive" });
      return;
    }
    let crystals = character.nova_crystals || 0;
    if (paidContinue) {
      if (crystals < DUNGEON_CONTINUE_COST) {
        toast({ title: "Not enough Nova Crystals", description: `Continue costs ${DUNGEON_CONTINUE_COST} 💎.`, variant: "destructive" });
        return;
      }
      crystals -= DUNGEON_CONTINUE_COST;
      await api.entities.Character.update(character.id, { nova_crystals: crystals });
      setCharacter((c) => ({ ...c, nova_crystals: crystals }));
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
    const today = todayET();
    const maxPlayerHit = Math.max(0, ...battle.events.filter((e) => e.attacker === "player" && e.damage).map((e) => e.damage));
    const update = {};
    const prevLevel = character.level;
    let boostedXp = 0;
    let collectPct = 0;
    let newLevel = character.level;
    let unlockedShipMod = null;
    let gearItem = null;
    let droppedConsumable = null;
    let milestoneItem = null;
    let defeatNote;

    ({ percentage: collectPct } = getCollectionStats(character));
    boostedXp = applyXpBonus(rewards.experience || 0, collectPct);
    if (boostedXp > 0) {
      let newExp = (character.experience || 0) + boostedXp;
      let expToNext = character.experience_to_next_level;
      while (newExp >= expToNext) { newExp -= expToNext; newLevel++; expToNext = getExpForLevel(newLevel); }
      update.experience = newExp;
      update.level = newLevel;
      update.experience_to_next_level = expToNext;
      update.unspent_stat_points = (character.unspent_stat_points || 0) + getStatPointsForLevelRange(character.level, newLevel);
    }

    if (won) {
      update.stardust = (character.stardust || 0) + (rewards.stardust || 0);
      update.total_stardust_earned = (character.total_stardust_earned || 0) + (rewards.stardust || 0);

      if (!wasPatrol) {
        update.dungeon_clears = (character.dungeon_clears || 0) + (rewards.isBoss ? 1 : 0);

        if (rewards.isBoss) {
          if (fightPlanet.id > DUNGEON_PLANETS.length) {
            // Infinite wormhole boss — go deeper, no story ship mods.
            update.dungeon_planet = (character.dungeon_planet || fightPlanet.id) + 1;
            update.dungeon_enemy = 1;
          } else if (fightPlanet.id === DUNGEON_PLANETS.length) {
            // World Zero — story finale. Grant Genesis Core and open the Wormhole.
            if (fightPlanet.shipModCat || fightPlanet.shipMod) {
              const grant = grantFrontierShipMod(character, fightPlanet);
              update.ship_mods = grant.ship_mods;
              if (grant.ship_mod_loadouts) update.ship_mod_loadouts = grant.ship_mod_loadouts;
              unlockedShipMod = grant.unlockedLabel;
              if (grant.consolationStardust) {
                update.stardust = (update.stardust ?? character.stardust ?? 0) + grant.consolationStardust;
                update.total_stardust_earned = (update.total_stardust_earned ?? character.total_stardust_earned ?? 0) + grant.consolationStardust;
              }
            }
            update.dungeon_planet = DUNGEON_PLANETS.length + 1;
            update.dungeon_enemy = 1;
            update.highest_sector = Math.max(character.highest_sector || 1, DUNGEON_PLANETS.length);
          } else {
            update.dungeon_planet = fightPlanet.id + 1;
            update.dungeon_enemy = 1;
            update.highest_sector = Math.max(character.highest_sector || 1, fightPlanet.id + 1);
            if (fightPlanet.shipModCat || fightPlanet.shipMod) {
              const grant = grantFrontierShipMod(character, fightPlanet);
              update.ship_mods = grant.ship_mods;
              if (grant.ship_mod_loadouts) update.ship_mod_loadouts = grant.ship_mod_loadouts;
              unlockedShipMod = grant.unlockedLabel;
              if (grant.consolationStardust) {
                update.stardust = (update.stardust ?? character.stardust ?? 0) + grant.consolationStardust;
                update.total_stardust_earned = (update.total_stardust_earned ?? character.total_stardust_earned ?? 0) + grant.consolationStardust;
              }
            }
          }
        } else {
          update.dungeon_enemy = Math.min(DUNGEON_ENEMIES_PER_PLANET, fightIndex + 1);
        }
      }

      if (rewards.item) {
        gearItem = rewards.item;
        await addItemWithCap(character, { ...rewards.item, owner_id: character.created_by_id, character_id: character.id });
      }
      if (Math.random() < (wasPatrol ? 0.1 : 0.2)) {
        droppedConsumable = consumableItem(randomConsumable());
        await addItemWithCap(character, { ...droppedConsumable, owner_id: character.created_by_id, character_id: character.id });
      }

      const mile = rollMilestoneChest(character, character.level);
      update.dungeon_nodes_cleared = mile.nodesCleared;
      if (mile.item) {
        milestoneItem = mile.item;
        await addItemWithCap(character, { ...mile.item, owner_id: character.created_by_id, character_id: character.id });
      }

      void api.entities.GalaxyNews.create({
        message: wasPatrol
          ? `🛰️ ${character.name} patrolled ${fightPlanet.name} and defeated ${enemy.name}.`
          : rewards.isBoss
          ? (unlockedShipMod
              ? `👑 ${character.name} conquered ${fightPlanet.bossName} and unlocked ${unlockedShipMod}!`
              : `👑 ${character.name} conquered ${fightPlanet.bossName}!`)
          : `⚔️ ${character.name} cleared enemy ${fightIndex} on ${fightPlanet.name}.`,
        entry_type: "victory",
        character_name: character.name,
        character_id: character.id,
      });
    } else {
      update.dungeon_deaths = Math.min(deathCap, deaths + 1);
      update.dungeon_deaths_date = today;
      void api.entities.GalaxyNews.create({
        message: `💀 ${character.name} fell to ${enemy.name} on ${fightPlanet.name}.`,
        entry_type: "defeat",
        character_name: character.name,
        character_id: character.id,
      });
      defeatNote = freeLivesLeft > 1
        ? `Death ${deaths + 1}/${deathCap}. Small XP consolation applied.`
        : freeLivesLeft === 1
        ? `Last free life spent. Further fights cost ${DUNGEON_CONTINUE_COST} 💎.`
        : `Next fight costs ${DUNGEON_CONTINUE_COST} 💎.`;
    }

    update.highest_damage = Math.max(character.highest_damage || 0, maxPlayerHit);
    update.dungeon_cooldown_at = new Date().toISOString();
    update.dungeon_cooldown_ms = dungeonCooldownMs(won);
    const { updates: discUpdates, found: discFound } = processDiscovery(character, { win: won, speciesId: battleState.enemy.speciesId });
    Object.assign(update, discUpdates);
    if (won) {
      const weekly = progressWeeklyNovaQuest(character, "dungeon", 1);
      if (weekly) update.weekly_nova_quests = weekly;
    }
    await api.entities.Character.update(character.id, update);
    setCharacter((c) => ({ ...c, ...update }));
    setBattleState(null);
    // After World Zero, drop the player on the Wormhole. After other story bosses, clear patrol selection.
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
      subtitle: `${fightPlanet.name}${rewards.isBoss ? " · Boss" : ""}${wasPatrol ? " · Patrol" : ""}${!won && rewards.consolation ? " · Consolation XP" : ""}`,
      xp: boostedXp > 0 ? { base: rewards.experience || 0, collectionPct: collectPct, total: boostedXp } : undefined,
      stardust: won ? { total: rewards.stardust || 0 } : undefined,
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
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!character) return null;

  const displayEnemy = patrol ? 1 : crawlEnemyIndex;

  return (
    <div className="space-y-5">
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

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="font-display font-bold text-xl tracking-wider flex items-center gap-2">
          <Satellite className="w-5 h-5 text-primary" /> Galactic Frontier
        </h1>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5" title="Free lives today (ET). After these, fights cost Nova Crystals.">
            {Array.from({ length: DUNGEON_DEATHS_PER_DAY }).map((_, i) => (
              <Skull key={i} className={`w-4 h-4 ${i < freeLivesLeft ? "text-red-400" : "text-muted/30"}`} />
            ))}
            <span className="text-muted-foreground ml-1">
              {freeLivesLeft > 0 ? `${freeLivesLeft} left` : "0 left · paid"}
            </span>
          </span>
          <span className="flex items-center gap-1 text-accent" title="Active ship mod tiers / catalogued frontier relics">
            <Rocket className="w-3.5 h-3.5" /> {realMods} mods{flavorMods.length ? ` · ${flavorMods.length} relics` : ""}
          </span>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Cooldown: {Math.round(DUNGEON_WIN_COOLDOWN_MS / 60000)}m after wins · {Math.round(DUNGEON_LOSS_COOLDOWN_MS / 60000)}m after losses
        {inInfinite ? ` · Wormhole depth ${infiniteDepth}` : ""}
      </p>

      <DungeonMap
        planets={DUNGEON_PLANETS}
        storyPlanetId={storyPlanetId}
        inInfinite={inInfinite}
        infiniteDepth={infiniteDepth}
        selectedId={effectiveSelection}
        onSelect={(id) => setSelectedPlanetId(id)}
      />

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
  );
}

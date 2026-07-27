import React, { useState, useEffect, useCallback } from "react";
import { api } from "@/api/gameClient";
import { trackNovaSpend } from "@/lib/novaTracker";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { getExpForLevel, randomConsumable, consumableItem } from "@/lib/gameData";
import { simulateBattle } from "@/lib/arenaEngine";
import { DUNGEON_PLANETS, getInfinitePlanet } from "@/lib/dungeonData";
import {
  DUNGEON_ENEMIES_PER_PLANET, DUNGEON_DEATHS_PER_DAY, DUNGEON_CONTINUE_COST,
  DUNGEON_BATTLE_COOLDOWN_MS, DUNGEON_SKIP_COST,
  generateDungeonEnemy, computeDungeonRewards,
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

import { todayET } from "@/lib/gameTime";

function fmtMs(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }

export default function GalaxyMapPage() {
  const [character, setCharacter] = useState(null);
  const [equippedItems, setEquippedItems] = useState([]);
  const [battleState, setBattleState] = useState(null);
  const [completeSummary, setCompleteSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
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
    // Backfill: characters that conquered World Zero under the old looping
    // bug carry the "Genesis Core" ship mod but had dungeon_planet clamped at
    // 10, so the World Zero badge (derived from dungeon_planet - 1) never
    // awarded. Advance them into the Infinite Dungeon so the badge resolves.
    if ((char.ship_mods || []).includes("Genesis Core") && (char.dungeon_planet || 1) <= 10) {
      try { await api.entities.Character.update(char.id, { dungeon_planet: 11, dungeon_enemy: 1 }); } catch (e) {}
      char.dungeon_planet = 11;
      char.dungeon_enemy = 1;
    }
    setCharacter(char);
    setLoading(false);
    // Equipped gear feeds combat — load it best-effort so a hiccup never
    // traps the page on the loading spinner.
    try { setEquippedItems((await api.entities.Item.filter({ character_id: char.id, is_equipped: true })) || []); } catch (e) {}
  }, [navigate]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const rawPlanet = Math.max(1, character?.dungeon_planet || 1);
  const inInfinite = rawPlanet > DUNGEON_PLANETS.length;
  const planetId = inInfinite ? rawPlanet : Math.min(DUNGEON_PLANETS.length, rawPlanet);
  const planet = inInfinite
    ? getInfinitePlanet(rawPlanet - DUNGEON_PLANETS.length)
    : (DUNGEON_PLANETS.find((p) => p.id === planetId) || DUNGEON_PLANETS[0]);
  const enemyIndex = Math.min(DUNGEON_ENEMIES_PER_PLANET, Math.max(1, character?.dungeon_enemy || 1));
  const deaths = Math.min(DUNGEON_DEATHS_PER_DAY, character?.dungeon_deaths || 0);
  const deathCap = DUNGEON_DEATHS_PER_DAY;
  const freeLivesLeft = Math.max(0, deathCap - deaths);
  const paidContinue = freeLivesLeft <= 0;
  const shipMods = character?.ship_mods || [];
  const cooldownEnds = character?.dungeon_cooldown_at ? new Date(character.dungeon_cooldown_at).getTime() + DUNGEON_BATTLE_COOLDOWN_MS : 0;
  const cooldownActive = now < cooldownEnds;

  async function skipCooldown() {
    if ((character.nova_crystals || 0) < DUNGEON_SKIP_COST) {
      toast({ title: "Not enough Nova Crystals", description: `Skip costs ${DUNGEON_SKIP_COST} 💎.`, variant: "destructive" });
      return;
    }
    const upd = { nova_crystals: (character.nova_crystals || 0) - DUNGEON_SKIP_COST, dungeon_cooldown_at: null };
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
    // Free lives spent — charge gems per fight, leave the death counter at the
    // cap so the header keeps reading "0 left" (don't reset to 3).
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
    const enemy = generateDungeonEnemy(planet, enemyIndex, character.level);
    const battle = simulateBattle(character, enemy, equippedItems);
    const rewards = computeDungeonRewards(planet, enemyIndex, character.level, battle.winner === "player");
    setBattleState({ enemy, battle, rewards, enemyIndex });
  }

  async function finishBattle() {
    const { enemy, battle, rewards, enemyIndex } = battleState;
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
    let defeatNote;

    if (won) {
      ({ percentage: collectPct } = getCollectionStats(character));
      boostedXp = applyXpBonus(rewards.experience, collectPct);
      let newExp = (character.experience || 0) + boostedXp;
      let expToNext = character.experience_to_next_level;
      while (newExp >= expToNext) { newExp -= expToNext; newLevel++; expToNext = getExpForLevel(newLevel); }
      update.experience = newExp;
      update.level = newLevel;
      update.experience_to_next_level = expToNext;
      update.stardust = (character.stardust || 0) + rewards.stardust;
      update.total_stardust_earned = (character.total_stardust_earned || 0) + rewards.stardust;
      update.dungeon_clears = (character.dungeon_clears || 0) + (rewards.isBoss ? 1 : 0);
      update.unspent_stat_points = (character.unspent_stat_points || 0) + (newLevel - character.level) * 4;

      if (rewards.isBoss) {
        // Beating a boss advances to the next world. The final boss (World
        // Zero, planet 10) can only be conquered ONCE: instead of looping back
        // to enemy 1 on the same planet (which let players farm the final boss
        // repeatedly), it shifts the crawl into the Infinite Dungeon (depth
        // 11+), where bosses keep scaling endlessly and drop no ship mod.
        const isFinalBoss = planet.id >= DUNGEON_PLANETS.length;
        if (isFinalBoss) {
          update.dungeon_planet = (character.dungeon_planet || planet.id) + 1;
          update.dungeon_enemy = 1;
          update.highest_sector = Math.max(character.highest_sector || 1, DUNGEON_PLANETS.length);
        } else {
          update.dungeon_planet = planet.id + 1;
          update.dungeon_enemy = 1;
          update.highest_sector = Math.max(character.highest_sector || 1, planet.id + 1);
          if (planet.shipMod) {
            const mods = [...(character.ship_mods || [])];
            if (!mods.includes(planet.shipMod)) {
              mods.push(planet.shipMod);
              unlockedShipMod = planet.shipMod;
            }
            update.ship_mods = mods;
          }
        }
      } else {
        update.dungeon_enemy = Math.min(DUNGEON_ENEMIES_PER_PLANET, enemyIndex + 1);
      }

      if (rewards.item) {
        gearItem = rewards.item;
        await addItemWithCap(character, { ...rewards.item, owner_id: character.created_by_id, character_id: character.id });
      }
      if (Math.random() < 0.2) {
        droppedConsumable = consumableItem(randomConsumable());
        await addItemWithCap(character, { ...droppedConsumable, owner_id: character.created_by_id, character_id: character.id });
      }
      void api.entities.GalaxyNews.create({
        message: rewards.isBoss
          ? (planet.shipMod
              ? `👑 ${character.name} conquered ${planet.bossName} and unlocked the ${planet.shipMod}!`
              : `👑 ${character.name} conquered ${planet.bossName} in the Infinite Dungeon!`)
          : `⚔️ ${character.name} cleared enemy ${enemyIndex} on ${planet.name}.`,
        entry_type: "victory",
        character_name: character.name,
        character_id: character.id,
      });
    } else {
      update.dungeon_deaths = Math.min(deathCap, deaths + 1);
      update.dungeon_deaths_date = today;
      void api.entities.GalaxyNews.create({
        message: `💀 ${character.name} fell to ${enemy.name} on ${planet.name}.`,
        entry_type: "defeat",
        character_name: character.name,
        character_id: character.id,
      });
      defeatNote = freeLivesLeft > 1
        ? `Death ${deaths + 1}/${deathCap}. You'll respawn at this enemy.`
        : freeLivesLeft === 1
        ? `Last free life spent. Further fights cost ${DUNGEON_CONTINUE_COST} 💎.`
        : `You'll respawn here. Next fight costs ${DUNGEON_CONTINUE_COST} 💎.`;
    }

    update.highest_damage = Math.max(character.highest_damage || 0, maxPlayerHit);
    update.dungeon_cooldown_at = new Date().toISOString();
    const { updates: discUpdates, found: discFound } = processDiscovery(character, { win: won, speciesId: battleState.enemy.speciesId });
    Object.assign(update, discUpdates);
    await api.entities.Character.update(character.id, update);
    setCharacter((c) => ({ ...c, ...update }));
    setBattleState(null);

    setCompleteSummary({
      mode: "dungeon",
      won,
      title: won
        ? (rewards.isBoss ? `Defeated ${enemy.name}` : `Cleared enemy ${enemyIndex}`)
        : `Fell to ${enemy.name}`,
      subtitle: `${planet.name}${rewards.isBoss ? " · Boss" : ""}`,
      xp: won ? { base: rewards.experience || 0, collectionPct: collectPct, total: boostedXp } : undefined,
      stardust: won ? { total: rewards.stardust || 0 } : undefined,
      leveledUp: won && newLevel > prevLevel,
      prevLevel,
      newLevel,
      statPoints: won ? (newLevel - prevLevel) * 4 : 0,
      gearItem: gearItem || undefined,
      shipMod: unlockedShipMod || undefined,
      consumableItem: droppedConsumable || undefined,
      discoveries: discFound,
      note: defeatNote,
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

  return (
    <div className="space-y-5">
      {battleState && (
        <ArenaBattleOverlay
          player={character}
          opponent={battleState.enemy}
          battle={battleState.battle}
          onDone={finishBattle}
          playerItems={equippedItems}
        />
      )}
      {completeSummary && (
        <CombatCompleteOverlay summary={completeSummary} onClose={() => setCompleteSummary(null)} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="font-display font-bold text-xl tracking-wider flex items-center gap-2">
          <Satellite className="w-5 h-5 text-primary" /> Galaxy Dungeon
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
          <span className="flex items-center gap-1 text-accent">
            <Rocket className="w-3.5 h-3.5" /> {shipMods.length} mods
          </span>
        </div>
      </div>

      <DungeonMap planets={DUNGEON_PLANETS} currentPlanetId={inInfinite ? DUNGEON_PLANETS.length + 1 : planetId} />

      <DungeonPlanetView
        planet={planet}
        currentEnemy={enemyIndex}
        paidContinue={paidContinue}
        continueCost={DUNGEON_CONTINUE_COST}
        onFight={handleFight}
        cooldownActive={cooldownActive}
        cooldownRemaining={cooldownEnds - now}
        cooldownSkipCost={DUNGEON_SKIP_COST}
        onSkipCooldown={skipCooldown}
      />
    </div>
  );
}
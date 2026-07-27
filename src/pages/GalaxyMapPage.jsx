import React, { useState, useEffect, useCallback } from "react";
import { api } from "@/api/gameClient";
import { trackNovaSpend } from "@/lib/novaTracker";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { getExpForLevel, randomConsumable, consumableItem } from "@/lib/gameData";
import { simulateBattle } from "@/lib/arenaEngine";
import { DUNGEON_PLANETS, getInfinitePlanet } from "@/lib/dungeonData";
import {
  DUNGEON_ENEMIES_PER_PLANET, DUNGEON_DEATHS_PER_DAY, DUNGEON_REVIVE_COST,
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
import { Satellite, Skull, Rocket } from "lucide-react";

import { todayET } from "@/lib/gameTime";

function fmtMs(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }

export default function GalaxyMapPage() {
  const [character, setCharacter] = useState(null);
  const [equippedItems, setEquippedItems] = useState([]);
  const [battleState, setBattleState] = useState(null);
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
  const deaths = character?.dungeon_deaths || 0;
  const deathCap = DUNGEON_DEATHS_PER_DAY;
  const reviveNeeded = deaths >= deathCap;
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
    if (reviveNeeded) {
      if ((character.nova_crystals || 0) < DUNGEON_REVIVE_COST) {
        toast({ title: "Not enough Nova Crystals", description: `Revive costs ${DUNGEON_REVIVE_COST} 💎.`, variant: "destructive" });
        return;
      }
      const upd = { nova_crystals: (character.nova_crystals || 0) - DUNGEON_REVIVE_COST, dungeon_deaths: 0 };
      await api.entities.Character.update(character.id, upd);
      setCharacter((c) => ({ ...c, ...upd }));
      void trackNovaSpend(character, DUNGEON_REVIVE_COST, "dungeon_revive");
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

    if (won) {
      const { percentage: collectPct } = getCollectionStats(character);
      const boostedXp = applyXpBonus(rewards.experience, collectPct);
      let newExp = (character.experience || 0) + boostedXp;
      let newLevel = character.level;
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
            if (!mods.includes(planet.shipMod)) mods.push(planet.shipMod);
            update.ship_mods = mods;
          }
        }
      } else {
        update.dungeon_enemy = Math.min(DUNGEON_ENEMIES_PER_PLANET, enemyIndex + 1);
      }

      if (rewards.item) {
        await addItemWithCap(character, { ...rewards.item, owner_id: character.created_by_id, character_id: character.id });
      }
      if (Math.random() < 0.2) {
        await addItemWithCap(character, { ...consumableItem(randomConsumable()), owner_id: character.created_by_id, character_id: character.id });
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

      toast({
        title: rewards.isBoss ? (planet.id === DUNGEON_PLANETS.length ? "🏆 DUNGEON CONQUERED!" : "🏆 BOSS DEFEATED!") : "Victory!",
        description: `+${boostedXp} XP · +${rewards.stardust} ✨${rewards.item ? ` · ${rewards.item.rarity} ${rewards.item.name}` : ""}${rewards.isBoss && planet.shipMod ? ` · 🔧 ${planet.shipMod} unlocked!` : ""}`,
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
      toast({
        title: "You Fell",
        description: `Death ${update.dungeon_deaths}/${deathCap}. You'll respawn at this enemy.`,
        variant: "destructive",
      });
    }

    update.highest_damage = Math.max(character.highest_damage || 0, maxPlayerHit);
    update.dungeon_cooldown_at = new Date().toISOString();
    const { updates: discUpdates, found: discFound } = processDiscovery(character, { win: won, speciesId: battleState.enemy.speciesId });
    Object.assign(update, discUpdates);
    if (discFound.length) {
      toast({ title: "🔎 Discovery!", description: discFound.map((f) => `${f.emoji} ${f.name}`).join(" · ") });
    }
    await api.entities.Character.update(character.id, update);
    setCharacter((c) => ({ ...c, ...update }));
    setBattleState(null);
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
        <ArenaBattleOverlay player={character} opponent={battleState.enemy} battle={battleState.battle} onDone={finishBattle} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="font-display font-bold text-xl tracking-wider flex items-center gap-2">
          <Satellite className="w-5 h-5 text-primary" /> Galaxy Dungeon
        </h1>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            {Array.from({ length: DUNGEON_DEATHS_PER_DAY }).map((_, i) => (
              <Skull key={i} className={`w-4 h-4 ${i < DUNGEON_DEATHS_PER_DAY - deaths ? "text-red-400" : "text-muted/30"}`} />
            ))}
            <span className="text-muted-foreground ml-1">{DUNGEON_DEATHS_PER_DAY - deaths} left</span>
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
        reviveNeeded={reviveNeeded}
        reviveCost={DUNGEON_REVIVE_COST}
        onFight={handleFight}
        cooldownActive={cooldownActive}
        cooldownRemaining={cooldownEnds - now}
        cooldownSkipCost={DUNGEON_SKIP_COST}
        onSkipCooldown={skipCooldown}
      />
    </div>
  );
}
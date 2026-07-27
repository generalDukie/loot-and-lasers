import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { api } from "@/api/gameClient";
import { useNavigate } from "react-router-dom";
import { RACES, CLASSES } from "@/lib/gameData";
import { computeTotalStats, computeTotalStatsNoBuffs } from "@/lib/statEngine";
import { spring } from "@/lib/goofyMotion";
import { getGuildMembership } from "@/lib/guildUtils";
import { getMyCharacter } from "@/lib/socialEngine";
import StatBar from "@/components/game/StatBar";
import StatAllocator from "@/components/game/StatAllocator";

import CharacterHeader from "@/components/game/CharacterHeader";
import InventoryGrid from "@/components/game/InventoryGrid";
import CollectiblesLog from "@/components/game/CollectiblesLog";
import CharacterStats from "@/components/game/CharacterStats";
import DerivedStatsPanel from "@/components/game/DerivedStatsPanel";
import { useInventory } from "@/hooks/useInventory";
import ActiveEffectsPanel from "@/components/game/ActiveEffectsPanel";
import { useToast } from "@/components/ui/use-toast";
import { Star, Backpack } from "lucide-react";

export default function CharacterPage() {
  const [character, setCharacter] = useState(null);
  const [guild, setGuild] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const inv = useInventory(character, (patch) => setCharacter((c) => ({ ...c, ...patch })));
  const { toast } = useToast();

  const load = useCallback(async () => {
    const char = await getMyCharacter();
    if (!char) { navigate("/create-character"); return; }
    setCharacter(char);
    // Render as soon as the operative is known; the guild badge is non-essential
    // and must never block the page (or leave it stuck on the spinner).
    setLoading(false);
    try {
      const membership = await getGuildMembership(char.id);
      if (membership) setGuild(await api.entities.Guild.get(membership.guild_id));
    } catch (e) { /* guild badge is best-effort */ }
  }, [navigate]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (character) inv.load(); }, [character?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function allocate(stat) {
    if (!character || (character.unspent_stat_points || 0) <= 0) return;
    const newStats = { ...character.stats, [stat]: (character.stats[stat] || 0) + 1 };
    const upd = { stats: newStats, unspent_stat_points: (character.unspent_stat_points || 0) - 1 };
    await api.entities.Character.update(character.id, upd);
    setCharacter((c) => ({ ...c, ...upd }));
  }

  async function handleUse(item) {
    const res = await inv.useConsumable(item);
    if (res && !res.ok && res.reason) {
      toast({ title: "Can't use", description: res.reason, variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  if (!character) return null;

  const equippedItems = inv.items.filter((i) => i.is_equipped);
  const totalStats = computeTotalStats(character, equippedItems);
  const baseStats = computeTotalStats(character, []);
  const noBuffStats = computeTotalStatsNoBuffs(character, equippedItems);
  const race = RACES[character.race];
  const cls = CLASSES[character.class];
  const fadeUp = (delay = 0) => ({ initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { ...spring, delay } });

  return (
    <div className="flex flex-col md:flex-row gap-4 md:h-[calc(100dvh-7rem)] md:overflow-hidden">
      {/* Left pane — identity, stats & lore (scrolls internally on desktop) */}
      <div className="md:flex-1 md:min-h-0 md:overflow-y-auto md:pr-1 space-y-4">
      <CharacterHeader character={character} guild={guild} equippedItems={equippedItems} />

      <motion.div {...fadeUp(0.05)}>
        <ActiveEffectsPanel character={character} onUpdate={(updater) => setCharacter(updater)} />
      </motion.div>

      <motion.div {...fadeUp(0.05)}>
        <CharacterStats character={character} />
      </motion.div>

      <motion.div {...fadeUp(0.08)}>
        <DerivedStatsPanel totalStats={totalStats} noBuffStats={noBuffStats} character={character} />
      </motion.div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Stats */}
        <motion.div {...fadeUp(0.1)} className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-5">
          <h2 className="font-display font-semibold text-sm tracking-wide text-muted-foreground mb-4 flex items-center gap-2">
            <Star className="w-4 h-4 text-primary" /> ATTRIBUTES
          </h2>
          <div className="space-y-3">
            {Object.entries(totalStats).map(([stat, val]) => (
              <StatBar key={stat} stat={stat} value={val} base={baseStats[stat]} maxValue={Math.max(30, val + 5)} />
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-border/30 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Total Attribute Points</span>
            <span className="font-display font-bold text-accent">{Object.values(totalStats).reduce((a, b) => a + (b || 0), 0)}</span>
          </div>
        </motion.div>

        {/* Appearance & lore */}
        <motion.div {...fadeUp(0.2)} className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-5">
          <h2 className="font-display font-semibold text-sm tracking-wide text-muted-foreground mb-4">APPEARANCE & LORE</h2>
          <div className="space-y-2.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Skin Tone</span>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded border border-border/50" style={{ backgroundColor: character.appearance?.skin_color }} />
                <span className="font-medium capitalize">{character.appearance?.skin_color || "Default"}</span>
              </div>
            </div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Eye Style</span><span className="font-medium">{character.appearance?.eye_style || "—"}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Marking</span><span className="font-medium">{character.appearance?.marking || "None"}</span></div>
          </div>
          <div className="mt-4 pt-4 border-t border-border/30">
            <h3 className="text-xs font-display font-semibold tracking-wide text-primary mb-2">{race?.name.toUpperCase()} LORE</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{race?.lore}</p>
          </div>
          <div className="mt-4 pt-4 border-t border-border/30">
            <h3 className="text-xs font-display font-semibold tracking-wide text-accent mb-2">{cls?.name.toUpperCase()}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{cls?.description}</p>
          </div>
          <div className="mt-3 rounded-xl bg-primary/5 border border-primary/30 p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">{cls?.emoji}</span>
              <h3 className="text-xs font-display font-semibold tracking-wide text-primary">CLASS ABILITY · {cls?.special?.name?.toUpperCase()}</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{cls?.special?.effect}</p>
          </div>
        </motion.div>
      </div>

      {character.unspent_stat_points > 0 && (
        <motion.div {...fadeUp(0.25)} className="bg-card/50 backdrop-blur-sm border border-primary/40 rounded-2xl p-5 border-glow-cyan">
          <h2 className="font-display font-semibold text-sm tracking-wide text-primary mb-3">UNSPENT POINTS — {character.unspent_stat_points}</h2>
          <StatAllocator stats={character.stats} points={character.unspent_stat_points} allowRemove={false} onAdd={allocate} className={character.class} />
        </motion.div>
      )}
      </div>

      {/* Right pane — inventory & collections (each panel scrolls internally) */}
      <div className="md:w-[44%] lg:w-[42%] xl:w-[40%] md:min-h-0 md:flex md:flex-col md:gap-4 space-y-4 md:space-y-0">
      {/* Inventory — individually scrollable */}
      <motion.div {...fadeUp(0.35)} className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-5 flex flex-col min-h-0 md:flex-1">
        <h2 className="font-display font-semibold text-sm tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
          <Backpack className="w-4 h-4 text-primary" /> INVENTORY
        </h2>
        <p className="text-[10px] text-muted-foreground/70 mb-3 italic">Hover an unequipped piece of gear to compare it with what you have equipped in that slot.</p>
        <div className="flex-1 min-h-0 overflow-y-auto -mr-1 pr-1">
          <InventoryGrid items={inv.items} onEquip={inv.equip} onSell={inv.sell} onBulkSell={inv.bulkSell} onUse={handleUse} onLock={inv.toggleLock} characterClass={character.class} />
        </div>
      </motion.div>

      {/* Collectibles — compact card opens full overlay */}
      <motion.div {...fadeUp(0.4)} className="md:shrink-0">
        <CollectiblesLog character={character} />
      </motion.div>
      </div>
    </div>
  );
}
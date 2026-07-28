import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/gameClient";
import { trackNovaSpend } from "@/lib/novaTracker";
import ShipModCard from "@/components/game/ShipModCard";
import ShipTypeCard from "@/components/game/ShipTypeCard";
import ShipHangarHero, { SHIP_HULL_THEME } from "@/components/game/ShipHangarHero";
import FuelStation from "@/components/game/FuelStation";
import {
  SHIP_TYPES, SHIP_MODS, STARTER_SHIP,
  getActiveShipId, getActiveShipType, getInstalledMods, getModEffectTotal,
  getCategoryProgress, getShipInherentLabel, getTierEffectLabel, computeMaxFuelForLoadout,
  getShipUnlockLevel, FUEL_MAX, getInventoryCap, INVENTORY_CAP, getTierCost, getShipModIds,
  getScoutMilestoneStatus, buildScoutMilestonePatch, SCOUT_MILESTONE_LEVEL,
} from "@/lib/gameData";
import { useToast } from "@/components/ui/use-toast";
import { getMyCharacter } from "@/lib/socialEngine";
import { Rocket, Gem, Sparkles, ChevronDown } from "lucide-react";
import { getActiveFuelMounts } from "@/lib/fuelMounts";

function HangarSection({ eyebrow, title, hint, action, children, delay = 0 }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-3"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[9px] font-display font-bold tracking-[0.22em] uppercase text-primary/70 mb-0.5">
              {eyebrow}
            </p>
          )}
          <h2 className="font-display font-bold text-sm tracking-wide text-foreground flex items-center gap-2">
            <span className="w-1 h-4 rounded-full bg-primary/70 shadow-[0_0_10px_hsl(190_90%_50%/0.5)]" />
            {title}
          </h2>
          {hint && <p className="text-[11px] text-muted-foreground mt-1 max-w-xl leading-relaxed">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </motion.section>
  );
}

export default function ShipPage() {
  const [character, setCharacter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [buyingMod, setBuyingMod] = useState(null);
  const [buyingShip, setBuyingShip] = useState(null);
  const [editingShipId, setEditingShipId] = useState(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const load = useCallback(async () => {
    const char = await getMyCharacter();
    if (!char) { navigate("/create-character"); return; }
    let next = char;
    const milePatch = buildScoutMilestonePatch(char);
    if (milePatch) {
      try {
        await api.entities.Character.update(char.id, milePatch);
        next = { ...char, ...milePatch };
        toast({
          title: "🛠️ Scout bay tuned!",
          description: `Lv ${SCOUT_MILESTONE_LEVEL} milestone — free Reinforced Fuel Tank T1 installed.`,
        });
      } catch (e) { /* non-blocking */ }
    }
    setCharacter(next);
    setEditingShipId((prev) => prev || getActiveShipId(next));
    setLoading(false);
  }, [navigate, toast]);

  useEffect(() => { load(); }, [load]);

  async function handleActivate(shipId) {
    setBuyingShip(shipId);
    try {
      const loadouts = { ...(character.ship_mod_loadouts || {}) };
      const newMods = loadouts[shipId] || [];
      const newMax = computeMaxFuelForLoadout(newMods, shipId);
      const patch = {
        active_ship: shipId,
        max_fuel: newMax,
        fuel: Math.min(character.fuel ?? FUEL_MAX, newMax),
        fuel_updated_at: new Date().toISOString(),
      };
      await api.entities.Character.update(character.id, patch);
      setCharacter((c) => ({ ...c, ...patch }));
      toast({ title: `🚀 ${SHIP_TYPES[shipId].name} activated` });
    } catch (err) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setBuyingShip(null);
    }
  }

  async function handleBuyShip(shipId) {
    const ship = SHIP_TYPES[shipId];
    if ((character.nova_crystals || 0) < ship.cost) {
      toast({ title: "Not enough Nova Crystals", description: `Need ${ship.cost} 💎 — you have ${character.nova_crystals || 0}.`, variant: "destructive" });
      return;
    }
    setBuyingShip(shipId);
    try {
      const loadouts = { ...(character.ship_mod_loadouts || {}) };
      if (!Array.isArray(loadouts[shipId])) loadouts[shipId] = [];
      const patch = {
        nova_crystals: (character.nova_crystals || 0) - ship.cost,
        owned_ships: [...(character.owned_ships || [STARTER_SHIP]), shipId],
        ship_mod_loadouts: loadouts,
      };
      await api.entities.Character.update(character.id, patch);
      setCharacter((c) => ({ ...c, ...patch }));
      setEditingShipId(shipId);
      void trackNovaSpend(character, ship.cost, "ship_purchase");
      toast({
        title: `🛸 ${ship.name} acquired!`,
        description: "Still flying your current vessel — outfit the new hull below, then Activate when ready.",
      });
    } catch (err) {
      toast({ title: "Purchase failed", description: err.message, variant: "destructive" });
    } finally {
      setBuyingShip(null);
    }
  }

  async function handleBuyMod(catKey) {
    const targetId = editingShipId || getActiveShipId(character);
    const progress = getCategoryProgress(character, catKey, targetId);
    if (!progress.next) return;
    const tier = progress.next;
    const cost = getTierCost(tier, targetId);
    if ((character.stardust || 0) < cost) {
      toast({ title: "Not enough stardust", description: `Need ${cost.toLocaleString()} ✨ — you have ${character.stardust || 0}.`, variant: "destructive" });
      return;
    }
    setBuyingMod(catKey);
    try {
      const loadouts = { ...(character.ship_mod_loadouts || {}) };
      const current = Array.isArray(loadouts[targetId])
        ? loadouts[targetId]
        : getShipModIds(character, targetId);
      const newMods = [...current, tier.id];
      loadouts[targetId] = newMods;
      const patch = {
        stardust: (character.stardust || 0) - cost,
        ship_mod_loadouts: loadouts,
      };
      if (tier.max_fuel_bonus && targetId === getActiveShipId(character)) {
        const newMax = computeMaxFuelForLoadout(newMods, targetId);
        patch.max_fuel = newMax;
        patch.fuel = Math.min((character.fuel ?? FUEL_MAX) + (newMax - (character.max_fuel || FUEL_MAX)), newMax);
        patch.fuel_updated_at = new Date().toISOString();
      }
      await api.entities.Character.update(character.id, patch);
      setCharacter((c) => ({ ...c, ...patch }));
      toast({ title: "🛠️ Mod Installed!", description: `${SHIP_MODS[catKey].name} — ${getTierEffectLabel(tier, targetId)}` });
    } catch (err) {
      toast({ title: "Install failed", description: err.message, variant: "destructive" });
    } finally {
      setBuyingMod(null);
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

  const activeShip = getActiveShipType(character);
  const activeId = getActiveShipId(character);
  const owned = Array.from(new Set([...(character.owned_ships || [STARTER_SHIP]), STARTER_SHIP]));
  const editId = editingShipId && owned.includes(editingShipId) ? editingShipId : activeId;
  const editShip = SHIP_TYPES[editId] || activeShip;
  const editTheme = SHIP_HULL_THEME[editId] || SHIP_HULL_THEME.scout;
  const charLevel = character.level || 1;
  const totalMods = getInstalledMods(character, activeId).length;
  const maxFuel = character.max_fuel || FUEL_MAX;
  const mountsActive = getActiveFuelMounts(character).length > 0;

  const stardustPct = Math.round(getModEffectTotal(character, "mission_stardust_mult") * 100);
  const xpPct = Math.round(getModEffectTotal(character, "mission_xp_mult") * 100);
  const fuelSave = Math.round(getModEffectTotal(character, "fuel_cost_reduction"));
  const timePct = Math.round(getModEffectTotal(character, "mission_duration_reduction") * 100);
  const activeEffects = [
    { label: "Max Fuel", value: `${maxFuel}`, show: maxFuel > FUEL_MAX },
    { label: "Stardust", value: `+${stardustPct}%`, show: stardustPct > 0 },
    { label: "XP", value: `+${xpPct}%`, show: xpPct > 0 },
    { label: "Fuel Cost", value: `-${fuelSave}`, show: fuelSave > 0 },
    { label: "Time", value: `-${timePct}%`, show: timePct > 0 },
    { label: "Inventory", value: `${getInventoryCap(character)}`, show: getInventoryCap(character) > INVENTORY_CAP },
  ].filter((e) => e.show);

  return (
    <div className="relative -mx-1 px-1 pb-8">
      {/* Hangar atmosphere */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl"
        aria-hidden
      >
        <div className="absolute inset-0 bg-gradient-to-b from-sky-950/40 via-transparent to-transparent" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: `
              radial-gradient(1px 1px at 12% 18%, rgba(255,255,255,0.55), transparent),
              radial-gradient(1px 1px at 42% 8%, rgba(255,255,255,0.35), transparent),
              radial-gradient(1.5px 1.5px at 78% 22%, rgba(125,211,252,0.55), transparent),
              radial-gradient(1px 1px at 88% 60%, rgba(255,255,255,0.3), transparent),
              radial-gradient(1px 1px at 28% 72%, rgba(255,255,255,0.25), transparent),
              radial-gradient(1.5px 1.5px at 55% 40%, rgba(255,255,255,0.4), transparent)
            `,
          }}
        />
        <div className="absolute -top-24 right-[-10%] w-[55%] h-64 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute top-40 -left-16 w-56 h-56 rounded-full bg-indigo-500/10 blur-3xl" />
      </div>

      <div className="space-y-7">
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-end justify-between flex-wrap gap-3 pt-1"
        >
          <div>
            <p className="text-[9px] font-display font-bold tracking-[0.28em] uppercase text-primary/80 mb-1">
              Docking Bay
            </p>
            <h1 className="font-display font-black text-2xl sm:text-3xl tracking-wide text-foreground flex items-center gap-2.5">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-primary/15 border border-primary/30 text-primary shadow-[0_0_18px_hsl(190_90%_50%/0.25)]">
                <Rocket className="w-4 h-4" />
              </span>
              Ship Hangar
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-background/70 backdrop-blur-sm border border-accent/30 text-accent px-3 py-1.5 rounded-full font-display font-semibold flex items-center gap-1.5 shadow-sm tabular-nums">
              <Sparkles className="w-3.5 h-3.5" /> {(character.stardust || 0).toLocaleString()}
            </span>
            <span className="text-xs bg-background/70 backdrop-blur-sm border border-amber-400/35 text-amber-300 px-3 py-1.5 rounded-full font-display font-semibold flex items-center gap-1.5 shadow-sm tabular-nums">
              <Gem className="w-3.5 h-3.5" /> {(character.nova_crystals || 0).toLocaleString()}
            </span>
          </div>
        </motion.header>

        <ShipHangarHero
          ship={activeShip}
          shipId={activeId}
          fuel={character.fuel ?? FUEL_MAX}
          maxFuel={maxFuel}
          modsInstalled={totalMods}
          inherentLabel={getShipInherentLabel(activeShip)}
          bonuses={activeEffects}
        />

        <HangarSection
          eyebrow="Fleet"
          title="Starships"
          hint="Preview locked bays, buy hulls, and keep flying your current vessel while you outfit the next."
          delay={0.05}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(SHIP_TYPES).map(([key, ship]) => {
              const unlockLevel = getShipUnlockLevel(key);
              return (
                <ShipTypeCard
                  key={key}
                  ship={ship}
                  shipKey={key}
                  owned={owned.includes(key)}
                  active={key === activeId}
                  affordable={(character.nova_crystals || 0) >= ship.cost}
                  unlocked={charLevel >= unlockLevel}
                  unlockLevel={unlockLevel}
                  characterLevel={charLevel}
                  buying={buyingShip === key}
                  onBuy={() => handleBuyShip(key)}
                  onActivate={() => handleActivate(key)}
                  scoutMilestone={key === "scout" ? getScoutMilestoneStatus(character) : null}
                />
              );
            })}
          </div>
        </HangarSection>

        <HangarSection
          eyebrow="Loadout"
          title={`Upgrades · ${editShip.name}`}
          hint={editId !== activeId
            ? `Outfitting ${editShip.name} while flying ${activeShip.name}. Activate when ready.`
            : "Permanent mods for the selected hull. Higher hulls cost more and hit ~8% harder per tier."}
          delay={0.1}
          action={owned.length > 1 ? (
            <div className="flex flex-wrap gap-1.5 justify-end">
              {owned.map((id) => {
                const s = SHIP_TYPES[id];
                if (!s) return null;
                const theme = SHIP_HULL_THEME[id] || SHIP_HULL_THEME.scout;
                const selected = id === editId;
                const flying = id === activeId;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setEditingShipId(id)}
                    className={`text-[10px] font-display font-semibold px-2.5 py-1 rounded-full border transition-all ${
                      selected ? "" : "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
                    }`}
                    style={selected ? {
                      borderColor: `${theme.accent}88`,
                      backgroundColor: `${theme.accent}22`,
                      color: theme.accent,
                      boxShadow: `0 0 12px ${theme.accent}33`,
                    } : undefined}
                  >
                    {s.emoji} {s.name.split(" ").pop()}{flying ? " · fly" : ""}
                  </button>
                );
              })}
            </div>
          ) : null}
        >
          <div
            className="rounded-2xl border p-3 sm:p-4 space-y-3"
            style={{
              borderColor: `${editTheme.accent}33`,
              background: `linear-gradient(160deg, ${editTheme.accent}10, transparent 45%), rgba(0,0,0,0.2)`,
              boxShadow: `inset 0 1px 0 ${editTheme.accent}22`,
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(SHIP_MODS).map(([catKey, mod]) => (
                <ShipModCard
                  key={catKey}
                  mod={mod}
                  progress={getCategoryProgress(character, catKey, editId)}
                  stardust={character.stardust || 0}
                  buying={buyingMod === catKey}
                  onBuy={() => handleBuyMod(catKey)}
                  shipId={editId}
                  accent={editTheme.accent}
                />
              ))}
            </div>
          </div>
        </HangarSection>

        {/* Fuel mounts — deliberately last / quieter */}
        <motion.details
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="group rounded-2xl border border-amber-400/15 bg-gradient-to-br from-amber-500/[0.06] to-transparent open:border-amber-400/30"
        >
          <summary className="cursor-pointer list-none flex items-center justify-between gap-2 px-4 py-3.5 text-xs font-display font-semibold tracking-wide text-muted-foreground hover:text-foreground">
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-400/25 flex items-center justify-center text-sm">⛽</span>
              <span className="flex flex-col min-w-0">
                <span className="text-foreground/90">Fuel Mounts</span>
                <span className="font-normal text-[10px] text-muted-foreground/70 truncate">Temporary mission speed — optional</span>
              </span>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              {mountsActive && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30">active</span>
              )}
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
            </span>
          </summary>
          <div className="px-4 pb-4 border-t border-amber-400/10 pt-3">
            <FuelStation character={character} onUpdate={setCharacter} embedded />
          </div>
        </motion.details>
      </div>
    </div>
  );
}

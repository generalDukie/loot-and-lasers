import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/gameClient";
import { trackNovaSpend } from "@/lib/novaTracker";
import ShipModCard from "@/components/game/ShipModCard";
import ShipTypeCard from "@/components/game/ShipTypeCard";
import FuelStation from "@/components/game/FuelStation";
import {
  SHIP_TYPES, SHIP_MODS, STARTER_SHIP,
  getActiveShipId, getActiveShipType, getInstalledMods, getModEffectTotal,
  getCategoryProgress, getShipInherentLabel, getTierEffectLabel, computeMaxFuelForLoadout,
  getShipUnlockLevel, FUEL_MAX, getInventoryCap, INVENTORY_CAP,
} from "@/lib/gameData";
import { useToast } from "@/components/ui/use-toast";
import { getMyCharacter } from "@/lib/socialEngine";
import { Rocket, Gem, Sparkles } from "lucide-react";

export default function ShipPage() {
  const [character, setCharacter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [buyingMod, setBuyingMod] = useState(null);
  const [buyingShip, setBuyingShip] = useState(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const load = useCallback(async () => {
    const char = await getMyCharacter();
    if (!char) { navigate("/create-character"); return; }
    setCharacter(char);
    setLoading(false);
  }, [navigate]);

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
      const newMax = computeMaxFuelForLoadout(loadouts[shipId], shipId);
      const patch = {
        nova_crystals: (character.nova_crystals || 0) - ship.cost,
        owned_ships: [...(character.owned_ships || [STARTER_SHIP]), shipId],
        active_ship: shipId,
        ship_mod_loadouts: loadouts,
        max_fuel: newMax,
        fuel: Math.min(character.fuel ?? FUEL_MAX, newMax),
        fuel_updated_at: new Date().toISOString(),
      };
      await api.entities.Character.update(character.id, patch);
      setCharacter((c) => ({ ...c, ...patch }));
      void trackNovaSpend(character, ship.cost, "ship_purchase");
      toast({ title: `🛸 ${ship.name} acquired!`, description: "Set as active vessel." });
    } catch (err) {
      toast({ title: "Purchase failed", description: err.message, variant: "destructive" });
    } finally {
      setBuyingShip(null);
    }
  }

  async function handleBuyMod(catKey) {
    const progress = getCategoryProgress(character, catKey);
    if (!progress.next) return;
    const tier = progress.next;
    if ((character.stardust || 0) < tier.cost) {
      toast({ title: "Not enough stardust", description: `Need ${tier.cost} ✨ — you have ${character.stardust || 0}.`, variant: "destructive" });
      return;
    }
    setBuyingMod(catKey);
    try {
      const activeId = getActiveShipId(character);
      const loadouts = { ...(character.ship_mod_loadouts || {}) };
      const current = Array.isArray(loadouts[activeId]) ? loadouts[activeId] : getInstalledMods(character).map((m) => m.id);
      const newMods = [...current, tier.id];
      loadouts[activeId] = newMods;
      const patch = {
        stardust: (character.stardust || 0) - tier.cost,
        ship_mod_loadouts: loadouts,
      };
      if (tier.max_fuel_bonus) {
        const newMax = computeMaxFuelForLoadout(newMods, activeId);
        patch.max_fuel = newMax;
        patch.fuel = Math.min((character.fuel ?? FUEL_MAX) + (newMax - (character.max_fuel || FUEL_MAX)), newMax);
        patch.fuel_updated_at = new Date().toISOString();
      }
      await api.entities.Character.update(character.id, patch);
      setCharacter((c) => ({ ...c, ...patch }));
      toast({ title: "🛠️ Mod Installed!", description: `${SHIP_MODS[catKey].name} — ${getTierEffectLabel(tier, activeId)}` });
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
  const charLevel = character.level || 1;
  const totalMods = getInstalledMods(character).length;
  const maxFuel = character.max_fuel || FUEL_MAX;
  const fuelPct = Math.min(100, Math.round(((character.fuel ?? FUEL_MAX) / maxFuel) * 100));

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
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="font-display font-bold text-xl tracking-wider flex items-center gap-2">
          <Rocket className="w-5 h-5 text-primary" /> Ship Hangar
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-accent/10 text-accent px-3 py-1 rounded-full font-medium flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> {character.stardust || 0}
          </span>
          <span className="text-xs bg-primary/10 text-primary px-3 py-1 rounded-full font-medium flex items-center gap-1">
            <Gem className="w-3 h-3" /> {character.nova_crystals || 0}
          </span>
        </div>
      </motion.div>

      {/* Active ship */}
      <div className="painted-panel canvas-grain p-5">
        <div className="flex items-center gap-5">
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="relative w-20 h-20 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center text-5xl shrink-0 border-glow-cyan"
          >
            {activeShip.emoji}
          </motion.div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display font-bold text-base text-foreground">{activeShip.name}</h2>
            {getShipInherentLabel(activeShip) && (
              <p className="text-[11px] text-primary/80 font-medium mb-1">{getShipInherentLabel(activeShip)}</p>
            )}
            <p className="text-xs text-muted-foreground mb-2">{totalMods} mod{totalMods === 1 ? "" : "s"} installed</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${fuelPct}%` }} />
              </div>
              <span className="text-[10px] font-mono text-amber-400 shrink-0">{character.fuel ?? FUEL_MAX}/{maxFuel} ⛽</span>
            </div>
          </div>
        </div>
        {activeEffects.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border/50">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Active Bonuses</div>
            <div className="flex flex-wrap gap-2">
              {activeEffects.map((e) => (
                <span key={e.label} className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-medium">
                  {e.label} {e.value}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Fuel Station — temporary time-reduction mounts */}
      <FuelStation character={character} onUpdate={setCharacter} />

      {/* Ship types */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-display font-semibold text-muted-foreground tracking-wide">STARSHIPS</h2>
        </div>
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
                buying={buyingShip === key}
                onBuy={() => handleBuyShip(key)}
                onActivate={() => handleActivate(key)}
              />
            );
          })}
        </div>
      </div>

      {/* Mod catalog (applies to active ship) */}
      <div>
        <h2 className="text-xs font-display font-semibold text-muted-foreground tracking-wide mb-3">
          UPGRADES — {activeShip.name.toUpperCase()}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Object.entries(SHIP_MODS).map(([catKey, mod]) => (
            <ShipModCard
              key={catKey}
              mod={mod}
              progress={getCategoryProgress(character, catKey)}
              stardust={character.stardust || 0}
              buying={buyingMod === catKey}
              onBuy={() => handleBuyMod(catKey)}
              shipId={activeId}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { api } from "@/api/gameClient";
import { trackNovaSpend } from "@/lib/novaTracker";
import { useNavigate } from "react-router-dom";
import { getShopWindow, generateShopInventory, RARITY_COLORS, STAT_ICONS, consumableItem, generateShopConsumableSlots, randomConsumable } from "@/lib/gameData";
import { addItemWithCap } from "@/lib/inventoryCap";
import GearVisual from "@/components/game/GearVisual";
import { useToast } from "@/components/ui/use-toast";
import { getMyCharacter } from "@/lib/socialEngine";
import { ShoppingBag, Sparkles, Clock, Gem, RefreshCw } from "lucide-react";

function fmtCountdown(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}h ${m}m ${s}s`;
}

export default function ShopPage() {
  const [character, setCharacter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchased, setPurchased] = useState({});
  const [now, setNow] = useState(Date.now());
  const [consumableSlots, setConsumableSlots] = useState([]);
  const [gearRefreshSeed, setGearRefreshSeed] = useState(0);
  const [consRefreshSeed, setConsRefreshSeed] = useState(0);
  const [gearRefreshing, setGearRefreshing] = useState(false);
  const [consRefreshing, setConsRefreshing] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const win = getShopWindow();
  const gearSeed = win.idx + gearRefreshSeed;
  const consSeed = win.idx + consRefreshSeed;
  const REFRESH_COST = 10;

  const load = useCallback(async () => {
    const char = await getMyCharacter();
    if (!char) { navigate("/create-character"); return; }
    setCharacter(char);
    setLoading(false);
  }, [navigate]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!loading) setConsumableSlots(generateShopConsumableSlots(consSeed));
  }, [consSeed, loading]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const inventory = generateShopInventory(gearSeed, character.level || 1);
  const secondsLeft = Math.max(0, Math.floor((win.endsAt - now) / 1000));

  async function refreshGear() {
    if (gearRefreshing) return;
    if ((character.nova_crystals || 0) < REFRESH_COST) {
      toast({ title: "Not enough Nova Crystals", description: `Need ${REFRESH_COST} 💎 to refresh.`, variant: "destructive" });
      return;
    }
    setGearRefreshing(true);
    const newCrystals = (character.nova_crystals || 0) - REFRESH_COST;
    await api.entities.Character.update(character.id, { nova_crystals: newCrystals });
    setCharacter(c => ({ ...c, nova_crystals: newCrystals }));
    void trackNovaSpend(character, REFRESH_COST, "shop_refresh_gear");
    setPurchased({});
    setGearRefreshSeed(s => s + 1);
    setGearRefreshing(false);
    toast({ title: "🔄 Black Market Refreshed!", description: "New gear available." });
  }

  async function refreshConsumables() {
    if (consRefreshing) return;
    if ((character.nova_crystals || 0) < REFRESH_COST) {
      toast({ title: "Not enough Nova Crystals", description: `Need ${REFRESH_COST} 💎 to refresh.`, variant: "destructive" });
      return;
    }
    setConsRefreshing(true);
    const newCrystals = (character.nova_crystals || 0) - REFRESH_COST;
    await api.entities.Character.update(character.id, { nova_crystals: newCrystals });
    setCharacter(c => ({ ...c, nova_crystals: newCrystals }));
    void trackNovaSpend(character, REFRESH_COST, "shop_refresh_cons");
    setConsRefreshSeed(s => s + 1);
    setConsRefreshing(false);
    toast({ title: "🔄 Stims Refreshed!", description: "New stims available." });
  }

  async function buy(slot) {
    if (purchased[slot._slotId]) return;
    const novaCost = slot.nova_cost || 0;
    if ((character.stardust || 0) < slot.cost) {
      toast({ title: "Not enough stardust", description: `Need ${slot.cost} ✨ — you have ${character.stardust || 0}.`, variant: "destructive" });
      return;
    }
    if (novaCost && (character.nova_crystals || 0) < novaCost) {
      toast({ title: "Not enough Nova Crystals", description: `Need ${novaCost} 💎 — you have ${character.nova_crystals || 0}.`, variant: "destructive" });
      return;
    }
    const { _slotId, cost, nova_cost, ...itemData } = slot;
    const upd = { stardust: (character.stardust || 0) - cost };
    if (novaCost) upd.nova_crystals = (character.nova_crystals || 0) - novaCost;
    await api.entities.Character.update(character.id, upd);
    if (novaCost) void trackNovaSpend(character, novaCost, "shop_buy_legendary");
    // addItemWithCap counts unequipped items, unique-names the payload, and
    // stashes it as pending (triggering the InventoryFullModal toss prompt) if
    // the backpack is full — so purchases never silently overflow the cap.
    const created = await addItemWithCap(character, { ...itemData, owner_id: character.created_by_id, character_id: character.id, is_equipped: false });
    setPurchased(p => ({ ...p, [_slotId]: true }));
    setCharacter(c => ({ ...c, ...upd }));
    toast({ title: created ? "🛒 Purchased!" : "📦 Inventory full!", description: created ? `${slot.name} added to your inventory.` : `${slot.name} is waiting — toss an item to make room.` });
  }

  async function buyConsumable(slot, index) {
    if ((character.stardust || 0) < slot._cost) {
      toast({ title: "Not enough stardust", description: `Need ${slot._cost} ✨ — you have ${character.stardust || 0}.`, variant: "destructive" });
      return;
    }
    await api.entities.Character.update(character.id, { stardust: (character.stardust || 0) - slot._cost });
    const created = await addItemWithCap(character, { ...consumableItem(slot), owner_id: character.created_by_id, character_id: character.id, is_equipped: false });
    setCharacter(c => ({ ...c, stardust: (c.stardust || 0) - slot._cost }));
    setConsumableSlots(prev => {
      const next = [...prev];
      next[index] = { ...randomConsumable(), _slotId: `cons-${win.idx}-${index}-${Date.now()}` };
      return next;
    });
    toast({ title: created ? "🛒 Purchased!" : "📦 Inventory full!", description: created ? `${slot.name} added to your inventory.` : `${slot.name} is waiting — toss an item to make room.` });
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 16 }}
        className="flex items-center justify-between flex-wrap gap-3"
      >
        <h1 className="font-display font-bold text-xl tracking-wider flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-primary" /> Black Market
        </h1>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-sm font-display font-bold px-3 py-1 rounded-full bg-amber-400/10 text-amber-300 border border-amber-400/30">
            <Gem className="w-3.5 h-3.5" /> {character.nova_crystals || 0}
          </span>
          <span className="flex items-center gap-1 text-sm font-display font-bold px-3 py-1 rounded-full bg-accent/10 text-accent border border-accent/30">
            <Sparkles className="w-3.5 h-3.5" /> {character.stardust || 0}
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground px-3 py-1 rounded-full bg-muted/40 border border-border/40">
            <Clock className="w-3 h-3" /> {fmtCountdown(secondsLeft)}
          </span>
        </div>
      </motion.div>

      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-sm tracking-wide text-muted-foreground">Gear</h2>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={refreshGear}
          disabled={gearRefreshing}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-display font-semibold tracking-wide bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-400/30 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${gearRefreshing ? "animate-spin" : ""}`} />
          <span className="flex items-center gap-0.5"><Gem className="w-3 h-3" /> {REFRESH_COST}</span>
          Refresh
        </motion.button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {inventory.map(slot => {
          const color = RARITY_COLORS[slot.rarity] || "#9CA3AF";
          const owned = !!purchased[slot._slotId];
          const affordable = (character.stardust || 0) >= slot.cost && (!slot.nova_cost || (character.nova_crystals || 0) >= slot.nova_cost);
          return (
            <motion.div
              key={slot._slotId}
              initial={{ opacity: 0, scale: 0.85, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 16 }}
              whileHover={{ y: -4 }}
              className="p-4 rounded-xl border bg-card/60 backdrop-blur-sm flex flex-col"
              style={{ borderColor: color + "40", boxShadow: `0 0 12px ${color}10` }}
            >
              <div className="flex items-center gap-3 mb-3">
                <GearVisual type={slot.type} rarity={slot.rarity} name={slot.name} emoji={slot.emoji} />
                <div className="min-w-0">
                  <h4 className="font-display font-semibold text-sm truncate" style={{ color }}>{slot.name}</h4>
                  <p className="text-[10px] text-muted-foreground capitalize">{slot.rarity} · {slot.type}</p>
                </div>
              </div>

              {slot.stats && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
                  {Object.entries(slot.stats).filter(([, v]) => v > 0).map(([stat, val]) => (
                    <span key={stat} className="text-xs text-foreground/80">{STAT_ICONS[stat]} +{val}</span>
                  ))}
                </div>
              )}

              <div className="mt-auto flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-display font-bold">
                  <span className="flex items-center gap-1 text-accent">
                    <Sparkles className="w-3.5 h-3.5" /> {slot.cost}
                  </span>
                  {slot.nova_cost > 0 && (
                    <span className="flex items-center gap-1 text-amber-300">
                      <Gem className="w-3.5 h-3.5" /> {slot.nova_cost}
                    </span>
                  )}
                </span>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => buy(slot)}
                  disabled={owned || !affordable}
                  className={`text-xs px-3 py-1.5 rounded-lg font-display font-semibold tracking-wide transition-colors ${
                    owned ? "bg-muted text-muted-foreground" : affordable ? "bg-primary/15 text-primary hover:bg-primary/25 painted-btn" : "bg-muted/40 text-muted-foreground/50"
                  }`}
                >
                  {owned ? "Sold" : "Buy"}
                </motion.button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Consumables — always available, timed stat buffs */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-bold text-sm tracking-wide text-accent flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Consumables
          </h2>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={refreshConsumables}
            disabled={consRefreshing}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-display font-semibold tracking-wide bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-400/30 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${consRefreshing ? "animate-spin" : ""}`} />
            <span className="flex items-center gap-0.5"><Gem className="w-3 h-3" /> {REFRESH_COST}</span>
            Refresh
          </motion.button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {consumableSlots.map((slot, index) => {
            const color = RARITY_COLORS[slot.rarity] || "#9CA3AF";
            const affordable = (character.stardust || 0) >= slot._cost;
            return (
              <div key={slot._slotId} className="p-4 rounded-xl border bg-card/60 backdrop-blur-sm flex flex-col" style={{ borderColor: color + "40" }}>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">🧪</span>
                  <div>
                    <h4 className="font-display font-semibold text-sm" style={{ color }}>{slot.name}</h4>
                    <p className="text-[10px] text-muted-foreground capitalize">{slot.rarity} · consumable</p>
                  </div>
                </div>
                <p className="text-xs text-primary mb-3">{slot.consumable.stat === "all" ? "✨" : STAT_ICONS[slot.consumable.stat]} +{Math.round(slot.consumable.mult * 100)}% {slot.consumable.stat === "all" ? "ALL" : slot.consumable.stat} · {slot.consumable.duration_hours}h</p>
                <div className="mt-auto flex items-center justify-between">
                  <span className="flex items-center gap-1 text-sm font-display font-bold text-accent">
                    <Sparkles className="w-3.5 h-3.5" /> {slot._cost}
                  </span>
                  <button
                    onClick={() => buyConsumable(slot, index)}
                    disabled={!affordable}
                    className={`text-xs px-3 py-1.5 rounded-lg font-display font-semibold tracking-wide transition-colors ${
                      affordable ? "bg-primary/15 text-primary hover:bg-primary/25 painted-btn" : "bg-muted/40 text-muted-foreground/50"
                    }`}
                  >
                    Buy
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
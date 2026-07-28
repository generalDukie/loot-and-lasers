import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { api } from "@/api/gameClient";
import { trackNovaSpend } from "@/lib/novaTracker";
import { useNavigate } from "react-router-dom";
import {
  getShopWindow,
  generateShopInventory,
  generateHotDeal,
  RARITY_COLORS,
  STAT_ICONS,
  consumableItem,
  generateShopConsumableSlots,
  randomConsumable,
  normalizeShopMeta,
  shopGearSeed,
  shopConsSeed,
  SHOP_REFRESH_COST,
  gearTypeLabel,
  getStatColor,
  getVendorLine,
  rollHaggle,
} from "@/lib/gameData";
import { todayET, msUntilNextETMidnight, formatEtaShort } from "@/lib/gameTime";
import { powerRating } from "@/components/game/StatCompareBubble";
import { addItemWithCap } from "@/lib/inventoryCap";
import GearVisual from "@/components/game/GearVisual";
import { useToast } from "@/components/ui/use-toast";
import { getMyCharacter } from "@/lib/socialEngine";
import {
  ShoppingBag, Sparkles, Clock, Gem, RefreshCw, ArrowUp, ArrowDown, Minus,
  Swords, FlaskConical, PackageOpen, Flame, MessageSquare,
} from "lucide-react";

function fmtCountdown(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}h ${m}m ${String(s).padStart(2, "0")}s`;
}

function CompareBadge({ slot, equipped, characterClass }) {
  if (slot?._bundle) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-display font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-400/30">
        Bundle
      </span>
    );
  }
  const my = powerRating(slot, characterClass);
  if (!equipped) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-display font-bold px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-400/30">
        <PackageOpen className="w-2.5 h-2.5" /> Empty slot
      </span>
    );
  }
  const eq = powerRating(equipped, characterClass);
  const d = my - eq;
  if (d > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-display font-bold px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-400/35">
        <ArrowUp className="w-2.5 h-2.5" /> +{d} vs equipped
      </span>
    );
  }
  if (d < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-display font-bold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-400/35">
        <ArrowDown className="w-2.5 h-2.5" /> {d} vs equipped
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-display font-bold px-1.5 py-0.5 rounded-full bg-muted/40 text-muted-foreground border border-border/40">
      <Minus className="w-2.5 h-2.5" /> Same power
    </span>
  );
}

function StatDeltaRow({ slot, equipped }) {
  if (slot?._bundle || !slot?.stats) return null;
  const keys = Object.keys(slot.stats).filter((k) => (slot.stats[k] || 0) > 0 || (equipped?.stats?.[k] || 0) > 0);
  if (!keys.length) return null;
  return (
    <div className="flex flex-wrap gap-x-2.5 gap-y-1 mb-2">
      {keys.map((stat) => {
        const v = slot.stats[stat] || 0;
        const e = equipped?.stats?.[stat] || 0;
        const d = v - e;
        const color = getStatColor(stat);
        return (
          <span key={stat} className="text-[10px] tabular-nums font-medium" style={{ color }} title={equipped ? `Equipped ${e}` : "No piece equipped"}>
            {STAT_ICONS[stat]} {v}
            {equipped ? (
              <span className={d > 0 ? "text-green-400" : d < 0 ? "text-red-400" : "text-muted-foreground"}>
                {" "}({d > 0 ? "+" : ""}{d})
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

function stripShopFields(slot) {
  const {
    _slotId, cost, nova_cost, _hotDeal, _bundle, bundle_items, _cost,
    ...itemData
  } = slot;
  return itemData;
}

export default function ShopPage() {
  const [character, setCharacter] = useState(null);
  const [equipped, setEquipped] = useState([]);
  const [loading, setLoading] = useState(true);
  const [shopMeta, setShopMeta] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [consumableSlots, setConsumableSlots] = useState([]);
  const [gearRefreshing, setGearRefreshing] = useState(false);
  const [consRefreshing, setConsRefreshing] = useState(false);
  const [busySlot, setBusySlot] = useState(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const win = getShopWindow();
  const dayKey = todayET();

  const load = useCallback(async () => {
    const char = await getMyCharacter();
    if (!char) { navigate("/create-character"); return; }
    const meta = normalizeShopMeta(char, getShopWindow(), todayET());
    if (
      !char.shop_meta
      || char.shop_meta.window_idx !== meta.window_idx
      || char.shop_meta.hot_day !== meta.hot_day
    ) {
      try {
        await api.entities.Character.update(char.id, { shop_meta: meta });
      } catch (e) { /* best-effort */ }
    }
    setCharacter({ ...char, shop_meta: meta });
    setShopMeta(meta);
    try {
      const items = (await api.entities.Item.filter({ character_id: char.id, is_equipped: true })) || [];
      setEquipped(items);
    } catch (e) {
      setEquipped([]);
    }
    setLoading(false);
  }, [navigate]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!shopMeta) return;
    setConsumableSlots(generateShopConsumableSlots(shopConsSeed(shopMeta, win)));
  }, [shopMeta?.cons_refresh, shopMeta?.window_idx, win.idx]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!shopMeta) return;
    const fresh = normalizeShopMeta({ shop_meta: shopMeta }, win, todayET());
    if (fresh.window_idx === shopMeta.window_idx && fresh.hot_day === shopMeta.hot_day) return;
    setShopMeta(fresh);
    if (character) {
      setCharacter((c) => ({ ...c, shop_meta: fresh }));
      api.entities.Character.update(character.id, { shop_meta: fresh }).catch(() => {});
    }
  }, [win.idx, dayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const equippedByType = useMemo(
    () => Object.fromEntries(equipped.map((i) => [i.type, i])),
    [equipped],
  );

  const inventory = useMemo(() => {
    if (!shopMeta || !character) return [];
    return generateShopInventory(shopGearSeed(shopMeta, win), character.level || 1);
  }, [shopMeta, character, win.idx]); // eslint-disable-line react-hooks/exhaustive-deps

  const hotDeal = useMemo(() => {
    if (!character) return null;
    return generateHotDeal(dayKey, character.level || 1);
  }, [dayKey, character]);

  const vendorLine = useMemo(
    () => getVendorLine((win.idx || 0) * 17 + dayKey.length * 3),
    [win.idx, dayKey],
  );

  async function saveMeta(nextMeta, extraCharPatch = {}) {
    setShopMeta(nextMeta);
    setCharacter((c) => ({ ...c, ...extraCharPatch, shop_meta: nextMeta }));
    await api.entities.Character.update(character.id, { shop_meta: nextMeta, ...extraCharPatch });
  }

  async function grantItems(payloads) {
    let anyCreated = false;
    let lastName = payloads[0]?.name || "Item";
    for (const payload of payloads) {
      const created = await addItemWithCap(character, {
        ...payload,
        owner_id: character.created_by_id,
        character_id: character.id,
        is_equipped: false,
      });
      if (created) anyCreated = true;
      lastName = payload.name || lastName;
    }
    return { anyCreated, lastName };
  }

  async function purchaseGearSlot(slot, { haggle = false, isHot = false } = {}) {
    if (!shopMeta || busySlot) return;
    if (isHot && shopMeta.hot_purchased) return;
    if (!isHot && shopMeta.purchased?.[slot._slotId]) return;

    let stardustCost = slot.cost || 0;
    let haggleNote = null;
    if (haggle) {
      const outcome = rollHaggle();
      stardustCost = Math.max(1, Math.round(stardustCost * outcome.mult));
      haggleNote = outcome.label;
    }
    const novaCost = slot.nova_cost || 0;

    if ((character.stardust || 0) < stardustCost) {
      toast({
        title: "Not enough stardust",
        description: haggleNote
          ? `${haggleNote}. Need ✨${stardustCost.toLocaleString()}.`
          : `Need ${stardustCost} ✨ — you have ${character.stardust || 0}.`,
        variant: "destructive",
      });
      return;
    }
    if (novaCost && (character.nova_crystals || 0) < novaCost) {
      toast({ title: "Not enough Nova Crystals", description: `Need ${novaCost} 💎.`, variant: "destructive" });
      return;
    }

    setBusySlot(slot._slotId);
    try {
      const upd = { stardust: (character.stardust || 0) - stardustCost };
      if (novaCost) upd.nova_crystals = (character.nova_crystals || 0) - novaCost;

      const nextMeta = { ...shopMeta };
      if (isHot) {
        nextMeta.hot_day = dayKey;
        nextMeta.hot_purchased = true;
      } else {
        nextMeta.purchased = { ...shopMeta.purchased, [slot._slotId]: true };
      }
      upd.shop_meta = nextMeta;

      await api.entities.Character.update(character.id, upd);
      if (novaCost) void trackNovaSpend(character, novaCost, "shop_buy_legendary");

      let payloads;
      if (slot._bundle === "scrap_crate" && Array.isArray(slot.bundle_items)) {
        payloads = slot.bundle_items;
      } else {
        payloads = [stripShopFields(slot)];
      }
      const { anyCreated, lastName } = await grantItems(payloads);

      setShopMeta(nextMeta);
      setCharacter((c) => ({ ...c, ...upd }));
      toast({
        title: anyCreated ? (haggle ? "🤝 Deal struck!" : "🛒 Purchased!") : "📦 Inventory full!",
        description: [
          haggleNote,
          anyCreated
            ? (slot._bundle ? `${slot.name} opened.` : `${lastName} added to your inventory.`)
            : `${lastName} is waiting — toss an item to make room.`,
        ].filter(Boolean).join(" · "),
      });
    } catch (e) {
      toast({ title: "Purchase failed", description: e.message, variant: "destructive" });
    } finally {
      setBusySlot(null);
    }
  }

  async function refreshGear() {
    if (gearRefreshing || !shopMeta) return;
    if ((character.nova_crystals || 0) < SHOP_REFRESH_COST) {
      toast({ title: "Not enough Nova Crystals", description: `Need ${SHOP_REFRESH_COST} 💎 to refresh the Armory.`, variant: "destructive" });
      return;
    }
    setGearRefreshing(true);
    try {
      const crystals = (character.nova_crystals || 0) - SHOP_REFRESH_COST;
      const next = {
        ...shopMeta,
        gear_refresh: shopMeta.gear_refresh + 1,
        purchased: {},
      };
      await saveMeta(next, { nova_crystals: crystals });
      void trackNovaSpend(character, SHOP_REFRESH_COST, "shop_refresh_gear");
      toast({ title: "🔄 Armory restocked", description: "Fresh gear on the tables. Hot Deal unchanged." });
    } catch (e) {
      toast({ title: "Refresh failed", description: e.message, variant: "destructive" });
    } finally {
      setGearRefreshing(false);
    }
  }

  async function refreshConsumables() {
    if (consRefreshing || !shopMeta) return;
    if ((character.nova_crystals || 0) < SHOP_REFRESH_COST) {
      toast({ title: "Not enough Nova Crystals", description: `Need ${SHOP_REFRESH_COST} 💎 to refresh the Stim Lab.`, variant: "destructive" });
      return;
    }
    setConsRefreshing(true);
    try {
      const crystals = (character.nova_crystals || 0) - SHOP_REFRESH_COST;
      const next = { ...shopMeta, cons_refresh: shopMeta.cons_refresh + 1 };
      await saveMeta(next, { nova_crystals: crystals });
      void trackNovaSpend(character, SHOP_REFRESH_COST, "shop_refresh_cons");
      toast({ title: "🔄 Stim Lab restocked", description: "New stims on the rack." });
    } catch (e) {
      toast({ title: "Refresh failed", description: e.message, variant: "destructive" });
    } finally {
      setConsRefreshing(false);
    }
  }

  async function buyConsumable(slot, index) {
    if (busySlot) return;
    const cost = slot._cost ?? slot.sell_value ?? 25;
    if ((character.stardust || 0) < cost) {
      toast({ title: "Not enough stardust", description: `Need ${cost} ✨ — you have ${character.stardust || 0}.`, variant: "destructive" });
      return;
    }
    setBusySlot(slot._slotId);
    try {
      const sd = (character.stardust || 0) - cost;
      await api.entities.Character.update(character.id, { stardust: sd });

      let payloads;
      if (slot._bundle === "stim_trio" && Array.isArray(slot.bundle_items)) {
        payloads = slot.bundle_items.map((d) => consumableItem(d));
      } else {
        payloads = [consumableItem(slot)];
      }
      const { anyCreated } = await grantItems(payloads);

      setCharacter((c) => ({ ...c, stardust: sd }));
      const fresh = randomConsumable();
      setConsumableSlots((prev) => {
        const next = [...prev];
        next[index] = {
          ...fresh,
          _slotId: `cons-${shopConsSeed(shopMeta, win)}-${index}-${Date.now()}`,
        };
        return next;
      });
      toast({
        title: anyCreated ? "🛒 Purchased!" : "📦 Inventory full!",
        description: anyCreated
          ? (slot._bundle ? `${slot.name} claimed.` : `${slot.name} added to your inventory.`)
          : `${slot.name} is waiting — toss an item to make room.`,
      });
    } catch (e) {
      toast({ title: "Purchase failed", description: e.message, variant: "destructive" });
    } finally {
      setBusySlot(null);
    }
  }

  if (loading || !shopMeta || !character) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const secondsLeft = Math.max(0, Math.floor((win.endsAt - now) / 1000));
  const hotEta = formatEtaShort(msUntilNextETMidnight(now));
  const purchased = shopMeta.purchased || {};
  const hotSold = !!shopMeta.hot_purchased;

  function renderGearActions(slot, { isHot = false } = {}) {
    const owned = isHot ? hotSold : !!purchased[slot._slotId];
    const affordable = (character.stardust || 0) >= slot.cost && (!slot.nova_cost || (character.nova_crystals || 0) >= slot.nova_cost);
    const canHaggleAfford = (character.stardust || 0) >= Math.ceil(slot.cost * 0.9);
    return (
      <div className="mt-auto flex items-end justify-between gap-2 pt-1">
        <span className="flex flex-col gap-0.5">
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
        </span>
        <div className="flex items-center gap-1.5">
          {!owned && !slot._bundle && (
            <button
              type="button"
              onClick={() => purchaseGearSlot(slot, { haggle: true, isHot })}
              disabled={!canHaggleAfford || busySlot === slot._slotId}
              title="Negotiate: 35% chance −10%, 40% firm, 25% +5%"
              className="text-[10px] px-2 py-1.5 rounded-lg font-display font-semibold tracking-wide border border-fuchsia-400/35 text-fuchsia-300 hover:bg-fuchsia-500/15 disabled:opacity-40"
            >
              Haggle
            </button>
          )}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => purchaseGearSlot(slot, { isHot })}
            disabled={owned || !affordable || busySlot === slot._slotId}
            className={`text-xs px-3 py-1.5 rounded-lg font-display font-semibold tracking-wide transition-colors ${
              owned
                ? "bg-muted text-muted-foreground"
                : affordable
                  ? "bg-primary/15 text-primary hover:bg-primary/25 painted-btn"
                  : "bg-muted/40 text-muted-foreground/50"
            }`}
          >
            {owned ? "Sold" : busySlot === slot._slotId ? "…" : slot._bundle ? "Open" : "Buy"}
          </motion.button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative -mx-1 px-1 pb-8">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl" aria-hidden>
        <div className="absolute inset-0 bg-gradient-to-b from-violet-950/35 via-transparent to-amber-950/20" />
        <div className="absolute -top-20 left-1/4 w-72 h-72 rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="absolute top-40 right-0 w-64 h-64 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className="space-y-7">
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-end justify-between flex-wrap gap-3 pt-1"
        >
          <div className="min-w-0">
            <p className="text-[9px] font-display font-bold tracking-[0.28em] uppercase text-fuchsia-300/80 mb-1">
              Under the table
            </p>
            <h1 className="font-display font-black text-2xl sm:text-3xl tracking-wide text-foreground flex items-center gap-2.5">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-fuchsia-500/15 border border-fuchsia-400/30 text-fuchsia-300 shadow-[0_0_18px_rgba(232,121,249,0.25)]">
                <ShoppingBag className="w-4 h-4" />
              </span>
              Black Market
            </h1>
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-fuchsia-200/80 italic max-w-md leading-relaxed">
              <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5 text-fuchsia-400/80" />
              “{vendorLine}”
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <span className="flex items-center gap-1.5 text-xs font-display font-semibold px-3 py-1.5 rounded-full bg-background/70 border border-amber-400/35 text-amber-300 tabular-nums">
              <Gem className="w-3.5 h-3.5" /> {(character.nova_crystals || 0).toLocaleString()}
            </span>
            <span className="flex items-center gap-1.5 text-xs font-display font-semibold px-3 py-1.5 rounded-full bg-background/70 border border-accent/30 text-accent tabular-nums">
              <Sparkles className="w-3.5 h-3.5" /> {(character.stardust || 0).toLocaleString()}
            </span>
            <span className="flex items-center gap-1.5 text-xs font-display font-semibold px-3 py-1.5 rounded-full bg-background/70 border border-border/50 text-muted-foreground tabular-nums">
              <Clock className="w-3.5 h-3.5 text-primary" /> {fmtCountdown(secondsLeft)}
            </span>
          </div>
        </motion.header>

        {/* ——— Daily Hot Deal ——— */}
        {hotDeal && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-2xl border border-orange-400/40 bg-gradient-to-br from-orange-500/15 via-card/50 to-fuchsia-500/10 p-4 sm:p-5 shadow-[0_0_40px_rgba(251,146,60,0.12)]"
          >
            <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
              <div>
                <p className="text-[9px] font-display font-bold tracking-[0.2em] uppercase text-orange-300 mb-0.5 flex items-center gap-1">
                  <Flame className="w-3 h-3" /> Hot Deal · daily
                </p>
                <h2 className="font-display font-bold text-base tracking-wide text-foreground">
                  One piece. No restock. Resets {hotEta}.
                </h2>
              </div>
              <span className="text-[10px] font-display font-semibold px-2 py-1 rounded-full border border-orange-400/40 text-orange-300 bg-orange-500/10 tabular-nums">
                ET midnight · {hotEta}
              </span>
            </div>
            {(() => {
              const slot = hotDeal;
              const color = RARITY_COLORS[slot.rarity] || "#9CA3AF";
              const eq = equippedByType[slot.type] || null;
              return (
                <div
                  className={`relative flex flex-col sm:flex-row gap-4 p-4 rounded-xl border bg-background/55 ${hotSold ? "opacity-70" : ""}`}
                  style={{ borderColor: color + "66", boxShadow: `0 0 22px ${color}22` }}
                >
                  {hotSold && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 rounded-xl">
                      <span className="text-xs font-display font-black tracking-[0.2em] uppercase text-muted-foreground border border-border/60 bg-card/80 px-3 py-1 rounded-full">
                        Claimed today
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 min-w-0 sm:w-1/2">
                    <GearVisual type={slot.type} rarity={slot.rarity} name={slot.name} baseName={slot.base_name} level_requirement={slot.level_requirement} size={56} />
                    <div className="min-w-0">
                      <h4 className="font-display font-bold text-base truncate" style={{ color }}>{slot.name}</h4>
                      <p className="text-[10px] text-muted-foreground capitalize">{slot.rarity} · {gearTypeLabel(slot.type)}</p>
                      <div className="mt-1.5"><CompareBadge slot={slot} equipped={eq} characterClass={character.class} /></div>
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col min-w-0">
                    <StatDeltaRow slot={slot} equipped={eq} />
                    {renderGearActions(slot, { isHot: true })}
                  </div>
                </div>
              );
            })()}
          </motion.section>
        )}

        {/* ——— Armory ——— */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/[0.07] via-card/40 to-transparent p-4 sm:p-5 shadow-[0_16px_40px_rgba(0,0,0,0.25)]"
        >
          <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
            <div>
              <p className="text-[9px] font-display font-bold tracking-[0.2em] uppercase text-cyan-300/80 mb-0.5">Stall A</p>
              <h2 className="font-display font-bold text-base tracking-wide text-foreground flex items-center gap-2">
                <Swords className="w-4 h-4 text-cyan-300" /> Armory
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">Haggle if you dare · crates sometimes</p>
            </div>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={refreshGear}
              disabled={gearRefreshing}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-display font-semibold tracking-wide bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-400/30 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${gearRefreshing ? "animate-spin" : ""}`} />
              Restock · <Gem className="w-3 h-3" /> {SHOP_REFRESH_COST}
            </motion.button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {inventory.map((slot) => {
              const color = RARITY_COLORS[slot.rarity] || "#9CA3AF";
              const owned = !!purchased[slot._slotId];
              const eq = equippedByType[slot.type] || null;
              const better = !owned && !slot._bundle && eq && powerRating(slot, character.class) > powerRating(eq, character.class);
              return (
                <motion.div
                  key={slot._slotId}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: owned ? 0.72 : 1, y: 0 }}
                  whileHover={owned ? undefined : { y: -3 }}
                  className={`relative p-4 rounded-xl border bg-background/50 backdrop-blur-sm flex flex-col overflow-hidden ${
                    owned ? "opacity-70" : better ? "ring-1 ring-green-400/35" : ""
                  }`}
                  style={{ borderColor: color + "45", boxShadow: owned ? undefined : `0 0 16px ${color}14` }}
                >
                  {owned && (
                    <div className="absolute inset-0 bg-black/35 z-10 flex items-center justify-center">
                      <span className="text-xs font-display font-black tracking-[0.2em] uppercase text-muted-foreground border border-border/60 bg-card/80 px-3 py-1 rounded-full">
                        Sold
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 mb-2">
                    {slot._bundle ? (
                      <div className="w-11 h-11 rounded-xl border border-amber-400/40 bg-amber-500/10 flex items-center justify-center text-2xl">📦</div>
                    ) : (
                      <GearVisual type={slot.type} rarity={slot.rarity} name={slot.name} baseName={slot.base_name} level_requirement={slot.level_requirement} />
                    )}
                    <div className="min-w-0 flex-1">
                      <h4 className="font-display font-semibold text-sm truncate" style={{ color }}>{slot.name}</h4>
                      <p className="text-[10px] text-muted-foreground capitalize">
                        {slot._bundle ? "bundle · 2 commons" : `${slot.rarity} · ${gearTypeLabel(slot.type)}`}
                      </p>
                    </div>
                  </div>
                  <div className="mb-2">
                    <CompareBadge slot={slot} equipped={eq} characterClass={character.class} />
                  </div>
                  {slot._bundle ? (
                    <p className="text-[10px] text-muted-foreground mb-2">{slot.flavor_text}</p>
                  ) : (
                    <StatDeltaRow slot={slot} equipped={eq} />
                  )}
                  {renderGearActions(slot)}
                </motion.div>
              );
            })}
          </div>
        </motion.section>

        {/* ——— Stim Lab ——— */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl border border-amber-400/20 bg-gradient-to-br from-amber-500/[0.08] via-card/40 to-violet-500/[0.05] p-4 sm:p-5 shadow-[0_16px_40px_rgba(0,0,0,0.25)]"
        >
          <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
            <div>
              <p className="text-[9px] font-display font-bold tracking-[0.2em] uppercase text-amber-300/80 mb-0.5">Stall B</p>
              <h2 className="font-display font-bold text-base tracking-wide text-foreground flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-amber-300" /> Stim Lab
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">Timed buffs · occasional Stim Trio packs</p>
            </div>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={refreshConsumables}
              disabled={consRefreshing}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-display font-semibold tracking-wide bg-violet-500/15 text-violet-300 hover:bg-violet-500/25 border border-violet-400/30 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${consRefreshing ? "animate-spin" : ""}`} />
              Restock · <Gem className="w-3 h-3" /> {SHOP_REFRESH_COST}
            </motion.button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {consumableSlots.map((slot, index) => {
              const color = RARITY_COLORS[slot.rarity] || "#9CA3AF";
              const cost = slot._cost ?? slot.sell_value ?? 25;
              const affordable = (character.stardust || 0) >= cost;
              const isTrio = slot._bundle === "stim_trio";
              const stat = slot.consumable?.stat || "all";
              const tint = isTrio ? "#FBBF24" : getStatColor(stat);
              const icon = isTrio ? "📦" : (stat === "all" ? "✨" : (STAT_ICONS[stat] || "🧪"));
              return (
                <div
                  key={slot._slotId}
                  className="p-4 rounded-xl border bg-background/50 backdrop-blur-sm flex flex-col"
                  style={{ borderColor: `${tint}55`, boxShadow: `0 0 14px ${tint}12` }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className="w-11 h-11 rounded-xl border flex items-center justify-center text-xl shrink-0"
                      style={{ backgroundColor: `${tint}18`, borderColor: `${tint}44` }}
                    >
                      {icon}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-display font-semibold text-sm truncate" style={{ color }}>{slot.name}</h4>
                      <p className="text-[10px] text-muted-foreground capitalize">
                        {isTrio ? "bundle · 3 stims" : `${slot.rarity} · stim`}
                      </p>
                    </div>
                  </div>
                  {isTrio ? (
                    <p className="text-xs text-amber-200/90 mb-3 leading-snug">
                      {(slot.bundle_items || []).map((b) => b.name.replace(/ Stim$/, "")).join(" · ")}
                    </p>
                  ) : (
                    <p className="text-xs font-medium mb-3" style={{ color: tint }}>
                      +{Math.round((slot.consumable?.mult || 0) * 100)}% {stat === "all" ? "ALL stats" : stat}
                      <span className="text-muted-foreground font-normal"> · {slot.consumable?.duration_hours}h</span>
                    </p>
                  )}
                  <div className="mt-auto flex items-center justify-between">
                    <span className="flex items-center gap-1 text-sm font-display font-bold text-accent">
                      <Sparkles className="w-3.5 h-3.5" /> {cost}
                    </span>
                    <button
                      onClick={() => buyConsumable({ ...slot, _cost: cost }, index)}
                      disabled={!affordable || busySlot === slot._slotId}
                      className={`text-xs px-3 py-1.5 rounded-lg font-display font-semibold tracking-wide transition-colors ${
                        affordable ? "bg-primary/15 text-primary hover:bg-primary/25 painted-btn" : "bg-muted/40 text-muted-foreground/50"
                      }`}
                    >
                      {busySlot === slot._slotId ? "…" : isTrio ? "Open" : "Buy"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.section>
      </div>
    </div>
  );
}

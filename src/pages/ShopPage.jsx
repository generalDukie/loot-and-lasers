import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { api } from "@/api/gameClient";
import { trackNovaSpend } from "@/lib/novaTracker";
import { trackStardustSpend } from "@/lib/stardustTracker";
import { applyPendingLootFromResponse } from "@/lib/inventoryCap";
import { useNavigate } from "react-router-dom";
import {
  getShopWindow,
  RARITY_COLORS,
  STAT_ICONS,
  SHOP_REFRESH_COST,
  gearTypeLabel,
  getStatColor,
  getVendorLine,
  STARDUST_COLOR,
} from "@/lib/gameData";
import { getShopGameDayKey, msUntilNextShopGameDay, formatEtaShort } from "@/lib/gameTime";
import { powerRating } from "@/components/game/StatCompareBubble";
import GearVisual from "@/components/game/GearVisual";
import { useToast } from "@/components/ui/use-toast";
import { getMyCharacter, primeMyCharacterCache } from "@/lib/socialEngine";
import { playHaggleWinGrowl } from "@/lib/shopHaggleSfx";
import {
  ShoppingBag, Clock, Gem, RefreshCw, ArrowUp, ArrowDown, Minus,
  Swords, PackageOpen, Flame, MessageSquare,
} from "lucide-react";
import StardustIcon, { STARDUST_GLYPH } from "@/components/game/StardustIcon";
import FitScaleFrame from "@/components/game/FitScaleFrame";

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
    <div className="flex flex-wrap gap-x-2 gap-y-0.5 mb-1.5">
      {keys.map((stat) => {
        const v = slot.stats[stat] || 0;
        const e = equipped?.stats?.[stat] || 0;
        const d = v - e;
        const color = getStatColor(stat);
        return (
          <span key={stat} className="text-[9px] tabular-nums font-medium" style={{ color }} title={equipped ? `Equipped ${e}` : "No piece equipped"}>
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

export default function ShopPage() {
  const [character, setCharacter] = useState(null);
  const [equipped, setEquipped] = useState([]);
  const [loading, setLoading] = useState(true);
  const [shopMeta, setShopMeta] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [gearRefreshing, setGearRefreshing] = useState(false);
  const [busySlot, setBusySlot] = useState(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const win = getShopWindow();
  const dayKey = getShopGameDayKey();

  const applyShopResult = useCallback((res, baseChar) => {
    const patch = res.patch || res.data?.patch || {};
    const meta = res.shop_meta || res.data?.shop_meta || patch.shop_meta;
    if (meta) setShopMeta(meta);
    setCharacter((c) => {
      const prev = baseChar || c;
      const next = { ...prev, ...patch, ...(meta ? { shop_meta: meta } : {}) };
      if (next?.created_by_id) primeMyCharacterCache(next);
      return next;
    });
    return { patch, meta };
  }, []);

  const [shopError, setShopError] = useState(null);

  const load = useCallback(async () => {
    const char = await getMyCharacter();
    if (!char) { navigate("/create-character"); return; }
    setShopError(null);
    try {
      const res = await api.functions.invoke("EnsureShop", {});
      const patch = res.patch || res.data?.patch || {};
      const meta = res.shop_meta || res.data?.shop_meta || patch.shop_meta;
      if (!meta?.gear_stock?.length) {
        throw new Error("Shop stock missing — is the API running the latest economy handlers?");
      }
      setShopMeta(meta);
      setCharacter({ ...char, ...patch, shop_meta: meta });
    } catch (e) {
      const msg = e?.message || "Could not load stock.";
      setShopError(msg);
      toast({ title: "Shop unavailable", description: msg, variant: "destructive" });
      setCharacter(char);
      // Keep any prior meta so we don't trap the page on the loading spinner.
      setShopMeta((prev) => prev || char.shop_meta || null);
    }
    try {
      const items = (await api.entities.Item.filter({ character_id: char.id, is_equipped: true })) || [];
      setEquipped(items);
    } catch (e) {
      setEquipped([]);
    }
    setLoading(false);
  }, [navigate, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // When the shop window or hot-deal day rolls over, re-ensure stock from server.
  const bootstrapped = React.useRef(false);
  useEffect(() => {
    if (!character || !shopMeta) return;
    if (!bootstrapped.current) {
      bootstrapped.current = true;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.functions.invoke("EnsureShop", {});
        if (cancelled) return;
        applyShopResult(res);
      } catch (e) { /* best-effort */ }
    })();
    return () => { cancelled = true; };
  }, [win.idx, dayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const equippedByType = useMemo(
    () => Object.fromEntries(equipped.map((i) => [i.type, i])),
    [equipped],
  );

  const inventory = shopMeta?.shop_stock?.length
    ? shopMeta.shop_stock
    : (shopMeta?.gear_stock || []);
  const hotDeal = shopMeta?.hot_deal || null;

  const vendorLine = useMemo(
    () => getVendorLine((win.idx || 0) * 17 + dayKey.length * 3),
    [win.idx, dayKey],
  );

  async function purchaseGearSlot(slot, { haggle = false, isHot = false } = {}) {
    if (!shopMeta || busySlot) return;
    if (isHot && (shopMeta.hot_purchased || shopMeta.hot_yanked)) return;
    if (!isHot && (shopMeta.purchased?.[slot._slotId] || shopMeta.yanked?.[slot._slotId])) return;

    const previewCost = slot.cost || 0;
    const novaCost = slot.nova_cost || 0;
    if (!haggle && (character.stardust || 0) < previewCost) {
      toast({
        title: "Not enough stardust",
        description: `Need ${previewCost} ${STARDUST_GLYPH} — you have ${character.stardust || 0}.`,
        variant: "destructive",
      });
      return;
    }
    if (haggle && (character.stardust || 0) < Math.ceil(previewCost * 0.85)) {
      toast({
        title: "Not enough stardust to haggle",
        description: `Need ${Math.ceil(previewCost * 0.85)} ${STARDUST_GLYPH} if the deal lands.`,
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
      const requestId = `shop-gear-${slot._slotId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const res = await api.functions.invoke("BuyShopGear", {
        slot_id: slot._slotId,
        haggle,
        is_hot: isHot,
        request_id: requestId,
        refresh_id: shopMeta?.window_idx,
      });
      const patch = res.patch || res.data?.patch || {};
      const meta = res.shop_meta || res.data?.shop_meta || patch.shop_meta || shopMeta;
      const items = res.items || res.data?.items || [];
      applyPendingLootFromResponse(res);
      const haggleNote = res.haggle_note ?? res.data?.haggle_note;
      const anyCreated = items.length > 0;
      const lastName = items[0]?.name || slot.name;
      // Prefer the explicit flag; fall back to yanked meta if an older response shape omits it.
      const yankedByHaggle = !!(
        haggle
        && !anyCreated
        && (isHot ? meta?.hot_yanked : meta?.yanked?.[slot._slotId])
      );
      const haggleFailed = !!(res.haggle_failed ?? res.data?.haggle_failed) || yankedByHaggle;

      if (haggleFailed) {
        if (meta) setShopMeta(meta);
        setCharacter((c) => ({ ...c, ...patch }));
        toast({
          title: "Haggle failed",
          description: haggleNote || "Deal soured — they yanked the listing.",
          variant: "destructive",
        });
        return;
      }

      if (meta) setShopMeta(meta);
      setCharacter((c) => ({ ...c, ...patch }));

      if (haggle) playHaggleWinGrowl();

      if (novaCost && anyCreated) void trackNovaSpend(character, novaCost, "shop_buy_legendary");
      const sdSpent = Math.max(0, (character.stardust || 0) - (patch.stardust ?? character.stardust ?? 0));
      if (sdSpent > 0) void trackStardustSpend(character, sdSpent, "shop_buy");

      toast({
        title: anyCreated ? (haggle ? "Deal struck!" : "Purchased!") : "Inventory full!",
        description: [
          haggleNote,
          anyCreated
            ? (slot._bundle ? `${slot.name} opened.` : `${lastName} added to your inventory.`)
            : `${lastName} is waiting — toss an item to make room.`,
        ].filter(Boolean).join(" · "),
      });
    } catch (e) {
      toast({ title: "Purchase failed", description: e.message, variant: "destructive" });
      await load();
    } finally {
      setBusySlot(null);
    }
  }

  async function refreshShop() {
    if (gearRefreshing || !shopMeta) return;
    const freeLeft = !shopMeta.free_refresh_used;
    if (!freeLeft && (character.nova_crystals || 0) < SHOP_REFRESH_COST) {
      toast({
        title: "Not enough Nova Crystals",
        description: `Need ${SHOP_REFRESH_COST} 💎 to refresh (free refresh already used this period).`,
        variant: "destructive",
      });
      return;
    }
    setGearRefreshing(true);
    try {
      const res = await api.functions.invoke("RefreshShop", {
        which: "all",
        use_free: freeLeft,
      });
      applyShopResult(res);
      const usedFree = res.used_free ?? res.data?.used_free ?? freeLeft;
      if (!usedFree) void trackNovaSpend(character, SHOP_REFRESH_COST, "shop_refresh");
      toast({
        title: "🔄 Black Market restocked",
        description: usedFree
          ? "Free refresh used — all 8 stalls rerolled."
          : "Premium refresh — all 8 stalls rerolled.",
      });
    } catch (e) {
      toast({ title: "Refresh failed", description: e.message, variant: "destructive" });
      await load();
    } finally {
      setGearRefreshing(false);
    }
  }

  async function buyConsumable(slot) {
    if (busySlot) return;
    if (shopMeta?.purchased?.[slot._slotId] || shopMeta?.yanked?.[slot._slotId]) return;
    const cost = slot.cost ?? slot._cost ?? 0;
    if ((character.stardust || 0) < cost) {
      toast({ title: "Not enough stardust", description: `Need ${cost} ${STARDUST_GLYPH} — you have ${character.stardust || 0}.`, variant: "destructive" });
      return;
    }
    setBusySlot(slot._slotId);
    try {
      const requestId = `shop-stim-${slot._slotId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const res = await api.functions.invoke("BuyShopConsumable", {
        slot_id: slot._slotId,
        request_id: requestId,
        refresh_id: shopMeta?.window_idx,
      });
      const patch = res.patch || res.data?.patch || {};
      const meta = res.shop_meta || res.data?.shop_meta || patch.shop_meta;
      const items = res.items || res.data?.items || [];
      applyPendingLootFromResponse(res);
      const anyCreated = items.length > 0;

      if (meta) setShopMeta(meta);
      setCharacter((c) => ({ ...c, ...patch }));
      const sdSpent = Math.max(0, (character.stardust || 0) - (patch.stardust ?? character.stardust ?? 0));
      if (sdSpent > 0) void trackStardustSpend(character, sdSpent, "shop_consumable");

      toast({
        title: anyCreated ? "🛒 Purchased!" : "📦 Inventory full!",
        description: anyCreated
          ? `${slot.name} added to your inventory.`
          : `${slot.name} is waiting — toss an item to make room.`,
      });
    } catch (e) {
      toast({ title: "Purchase failed", description: e.message, variant: "destructive" });
      await load();
    } finally {
      setBusySlot(null);
    }
  }

  if (loading || !character) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!inventory.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center px-4">
        <ShoppingBag className="w-8 h-8 text-fuchsia-300/80" />
        <p className="font-display font-bold text-sm text-foreground">Black Market is offline</p>
        <p className="text-xs text-muted-foreground max-w-sm">
          {shopError || "Could not load bazaar stock. Restart the game API (npm run server) and retry."}
        </p>
        <button type="button" onClick={() => { setLoading(true); load(); }} className="painted-btn px-4 py-2 text-xs">
          Retry
        </button>
      </div>
    );
  }

  const secondsLeft = Math.max(0, Math.floor((win.endsAt - now) / 1000));
  const hotEta = formatEtaShort(msUntilNextShopGameDay(now));
  const purchased = shopMeta.purchased || {};
  const yanked = shopMeta.yanked || {};
  const hotSold = !!shopMeta.hot_purchased;
  const hotYanked = !!shopMeta.hot_yanked;
  const freeLeft = !shopMeta.free_refresh_used;

  function isStimSlot(slot) {
    return slot?.type === "consumable" || slot?._offerKind === "stim";
  }

  function renderGearActions(slot, { isHot = false } = {}) {
    const wasYanked = isHot ? hotYanked : !!yanked[slot._slotId];
    const owned = isHot ? (hotSold || hotYanked) : !!(purchased[slot._slotId] || yanked[slot._slotId]);
    const affordable = (character.stardust || 0) >= slot.cost && (!slot.nova_cost || (character.nova_crystals || 0) >= slot.nova_cost);
    const canHaggleAfford = (character.stardust || 0) >= Math.ceil(slot.cost * 0.85);
    const goneLabel = wasYanked ? "Yanked" : "Sold";
    return (
      <div className="mt-auto flex items-end justify-between gap-2 pt-0.5">
        <span className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-xs font-display font-bold">
            <span className="flex items-center gap-1" style={{ color: STARDUST_COLOR }}>
              <StardustIcon className="w-3 h-3" /> {slot.cost}
            </span>
            {slot.nova_cost > 0 && (
              <span className="flex items-center gap-1 text-amber-300">
                <Gem className="w-3 h-3" /> {slot.nova_cost}
              </span>
            )}
          </span>
        </span>
        <div className="flex items-center gap-1">
          {!owned && !slot._bundle && (
            <button
              type="button"
              onClick={() => purchaseGearSlot(slot, { haggle: true, isHot })}
              disabled={!canHaggleAfford || busySlot === slot._slotId}
              title="~40% chance 15–20% off; otherwise they yank the listing"
              className="text-[9px] px-1.5 py-1 rounded-md font-display font-semibold tracking-wide border border-fuchsia-400/35 text-fuchsia-300 hover:bg-fuchsia-500/15 disabled:opacity-40"
            >
              Haggle
            </button>
          )}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => purchaseGearSlot(slot, { isHot })}
            disabled={owned || !affordable || busySlot === slot._slotId}
            className={`text-[10px] px-2.5 py-1 rounded-md font-display font-semibold tracking-wide transition-colors ${
              owned
                ? "bg-muted text-muted-foreground"
                : affordable
                  ? "bg-primary/15 text-primary hover:bg-primary/25 painted-btn"
                  : "bg-muted/40 text-muted-foreground/50"
            }`}
          >
            {owned ? goneLabel : busySlot === slot._slotId ? "…" : slot._bundle ? "Open" : "Buy"}
          </motion.button>
        </div>
      </div>
    );
  }

  function renderStimActions(slot) {
    const wasYanked = !!yanked[slot._slotId];
    const owned = !!(purchased[slot._slotId] || wasYanked);
    const cost = slot.cost ?? slot._cost ?? 0;
    const affordable = (character.stardust || 0) >= cost;
    return (
      <div className="mt-auto flex items-end justify-between gap-2 pt-0.5">
        <span className="flex items-center gap-1 text-xs font-display font-bold" style={{ color: STARDUST_COLOR }}>
          <StardustIcon className="w-3 h-3" /> {cost}
        </span>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => buyConsumable(slot)}
          disabled={owned || !affordable || busySlot === slot._slotId}
          className={`text-[10px] px-2.5 py-1 rounded-md font-display font-semibold tracking-wide transition-colors ${
            owned
              ? "bg-muted text-muted-foreground"
              : affordable
                ? "bg-primary/15 text-primary hover:bg-primary/25 painted-btn"
                : "bg-muted/40 text-muted-foreground/50"
          }`}
        >
          {owned ? (wasYanked ? "Yanked" : "Sold") : busySlot === slot._slotId ? "…" : "Buy"}
        </motion.button>
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden -mx-1 px-1 flex flex-col">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl" aria-hidden>
        <div className="absolute inset-0 bg-gradient-to-b from-violet-950/35 via-transparent to-amber-950/20" />
        <div className="absolute -top-20 left-1/4 w-72 h-72 rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="absolute top-40 right-0 w-64 h-64 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <FitScaleFrame>
        <div className="flex flex-col gap-2.5 pb-1">
          <motion.header
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between flex-wrap gap-2"
          >
            <div className="min-w-0">
              <p className="text-[8px] font-display font-bold tracking-[0.28em] uppercase text-fuchsia-300/80">
                Under the table
              </p>
              <h1 className="font-display font-black text-xl tracking-wide text-foreground flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-fuchsia-500/15 border border-fuchsia-400/30 text-fuchsia-300">
                  <ShoppingBag className="w-3.5 h-3.5" />
                </span>
                Black Market
              </h1>
              <p className="mt-0.5 flex items-start gap-1 text-[10px] text-fuchsia-200/80 italic max-w-md leading-snug">
                <MessageSquare className="w-3 h-3 shrink-0 mt-0.5 text-fuchsia-400/80" />
                “{vendorLine}”
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              <span className="flex items-center gap-1 text-[11px] font-display font-semibold px-2 py-1 rounded-full bg-background/70 border border-amber-400/35 text-amber-300 tabular-nums">
                <Gem className="w-3 h-3" /> {(character.nova_crystals || 0).toLocaleString()}
              </span>
              <span
                className="flex items-center gap-1 text-[11px] font-display font-semibold px-2 py-1 rounded-full bg-background/70 tabular-nums"
                style={{ color: STARDUST_COLOR, border: `1px solid ${STARDUST_COLOR}4D` }}
              >
                <StardustIcon className="w-3 h-3" /> {(character.stardust || 0).toLocaleString()}
              </span>
              <span className="flex items-center gap-1 text-[11px] font-display font-semibold px-2 py-1 rounded-full bg-background/70 border border-border/50 text-muted-foreground tabular-nums">
                <Clock className="w-3 h-3 text-primary" /> {fmtCountdown(secondsLeft)}
              </span>
            </div>
          </motion.header>

          {hotDeal && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative overflow-hidden rounded-xl border border-orange-500/55 bg-gradient-to-br from-orange-500/18 via-card/50 to-fuchsia-500/12 p-3.5 shadow-[0_0_40px_rgba(251,146,60,0.18)]"
            >
              <div className="flex items-center justify-center gap-2 mb-1.5">
                <p className="text-[10px] font-display font-black tracking-[0.18em] uppercase text-orange-200 flex items-center gap-1 bg-orange-500/10 border border-orange-400/25 px-2 py-0.5 rounded-md animate-pulse">
                  <Flame className="w-3 h-3" /> Hot Deal · resets {hotEta}
                </p>
              </div>
              {(() => {
                const slot = hotDeal;
                const color = RARITY_COLORS[slot.rarity] || "#9CA3AF";
                const eq = equippedByType[slot.type] || null;
                return (
                  <div
                    className={`relative flex flex-col sm:flex-row gap-2.5 p-2.5 rounded-lg border bg-background/55 ${hotSold || hotYanked ? "opacity-70" : ""}`}
                    style={{ borderColor: color + "66", boxShadow: `0 0 16px ${color}18` }}
                  >
                    {(hotSold || hotYanked) && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 rounded-lg">
                        <span className="text-[10px] font-display font-black tracking-[0.2em] uppercase text-muted-foreground border border-border/60 bg-card/80 px-2.5 py-0.5 rounded-full">
                          {hotYanked ? "Yanked today" : "Claimed today"}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 min-w-0 sm:w-[42%]">
                      <GearVisual type={slot.type} rarity={slot.rarity} name={slot.name} baseName={slot.base_name} level_requirement={slot.level_requirement} size={44} />
                      <div className="min-w-0">
                        <h4 className="font-display font-bold text-base truncate" style={{ color }}>{slot.name}</h4>
                        <p className="text-[9px] text-muted-foreground capitalize">{slot.rarity} · {gearTypeLabel(slot.type)}</p>
                        <div className="mt-1"><CompareBadge slot={slot} equipped={eq} characterClass={character.class} /></div>
                      </div>
                    </div>
                    <div className="flex-1 flex flex-col min-w-0 justify-between">
                      <StatDeltaRow slot={slot} equipped={eq} />
                      {renderGearActions(slot, { isHot: true })}
                    </div>
                  </div>
                );
              })()}
            </motion.section>
          )}

          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/[0.07] via-card/40 to-amber-500/[0.05] p-2.5 shadow-[0_12px_28px_rgba(0,0,0,0.22)] flex flex-col min-h-0"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
              <div>
                <h2 className="font-display font-bold text-sm tracking-wide text-foreground flex items-center gap-1.5">
                  <Swords className="w-3.5 h-3.5 text-cyan-300" /> Black Market
                </h2>
                <p className="text-[9px] text-muted-foreground">8 stalls · gear &amp; stims mixed · haggle gear</p>
              </div>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={refreshShop}
                disabled={gearRefreshing}
                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md font-display font-semibold tracking-wide bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-400/30 disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${gearRefreshing ? "animate-spin" : ""}`} />
                {freeLeft ? (
                  <>Free restock</>
                ) : (
                  <>Restock · <Gem className="w-2.5 h-2.5" /> {SHOP_REFRESH_COST}</>
                )}
              </motion.button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 auto-rows-fr flex-1 min-h-0">
              {inventory.map((slot) => {
                const stim = isStimSlot(slot);
                const color = RARITY_COLORS[slot.rarity] || "#9CA3AF";
                const wasYanked = !!yanked[slot._slotId];
                const owned = !!purchased[slot._slotId] || wasYanked;
                if (stim) {
                  const stat = slot.consumable?.stat || "all";
                  const tint = getStatColor(stat);
                  const icon = stat === "all" ? "✨" : (STAT_ICONS[stat] || "🧪");
                  return (
                    <motion.div
                      key={slot._slotId}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: owned ? 0.72 : 1, y: 0 }}
                      className={`relative h-full p-2.5 rounded-lg border bg-background/50 backdrop-blur-sm flex flex-col overflow-hidden ${owned ? "opacity-70" : ""}`}
                      style={{ borderColor: `${tint}55`, boxShadow: owned ? undefined : `0 0 10px ${tint}10` }}
                    >
                      {owned && (
                        <div className="absolute inset-0 bg-black/35 z-10 flex items-center justify-center">
                          <span className="text-[9px] font-display font-black tracking-[0.2em] uppercase text-muted-foreground border border-border/60 bg-card/80 px-2 py-0.5 rounded-full">
                            {wasYanked ? "Yanked" : "Sold"}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 mb-1.5">
                        <div
                          className="w-9 h-9 rounded-lg border flex items-center justify-center text-base shrink-0"
                          style={{ backgroundColor: `${tint}18`, borderColor: `${tint}44` }}
                        >
                          {icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-display font-semibold text-xs truncate" style={{ color }}>{slot.name}</h4>
                          <p className="text-[9px] text-muted-foreground capitalize">{slot.rarity} · stim</p>
                        </div>
                      </div>
                      <p className="text-[10px] font-medium mb-2" style={{ color: tint }}>
                        +{Math.round((slot.consumable?.mult || 0) * 100)}% {stat === "all" ? "ALL" : stat}
                        <span className="text-muted-foreground font-normal"> · {slot.consumable?.duration_hours}h</span>
                      </p>
                      {renderStimActions(slot)}
                    </motion.div>
                  );
                }

                const eq = equippedByType[slot.type] || null;
                const better = !owned && !slot._bundle && eq && powerRating(slot, character.class) > powerRating(eq, character.class);
                return (
                  <motion.div
                    key={slot._slotId}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: owned ? 0.72 : 1, y: 0 }}
                    className={`relative h-full p-2.5 rounded-lg border bg-background/50 backdrop-blur-sm flex flex-col overflow-hidden ${
                      owned ? "opacity-70" : better ? "ring-1 ring-green-400/35" : ""
                    }`}
                    style={{ borderColor: color + "45", boxShadow: owned ? undefined : `0 0 12px ${color}12` }}
                  >
                    {owned && (
                      <div className="absolute inset-0 bg-black/35 z-10 flex items-center justify-center">
                        <span className="text-[9px] font-display font-black tracking-[0.2em] uppercase text-muted-foreground border border-border/60 bg-card/80 px-2 py-0.5 rounded-full">
                          {wasYanked ? "Yanked" : "Sold"}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-1.5">
                      {slot._bundle ? (
                        <div className="w-9 h-9 rounded-lg border border-amber-400/40 bg-amber-500/10 flex items-center justify-center text-lg">📦</div>
                      ) : (
                        <GearVisual type={slot.type} rarity={slot.rarity} name={slot.name} baseName={slot.base_name} level_requirement={slot.level_requirement} size={36} />
                      )}
                      <div className="min-w-0 flex-1">
                        <h4 className="font-display font-semibold text-xs truncate" style={{ color }}>{slot.name}</h4>
                        <p className="text-[9px] text-muted-foreground capitalize">
                          {slot._bundle ? "bundle · 2 commons" : `${slot.rarity} · ${gearTypeLabel(slot.type)} · L${slot.level_requirement || "?"}`}
                        </p>
                      </div>
                    </div>
                    <div className="mb-1">
                      <CompareBadge slot={slot} equipped={eq} characterClass={character.class} />
                    </div>
                    {slot._bundle ? (
                      <p className="text-[9px] text-muted-foreground mb-1.5 line-clamp-2">{slot.flavor_text}</p>
                    ) : (
                      <StatDeltaRow slot={slot} equipped={eq} />
                    )}
                    {renderGearActions(slot)}
                  </motion.div>
                );
              })}
            </div>
          </motion.section>
        </div>
      </FitScaleFrame>
    </div>
  );
}

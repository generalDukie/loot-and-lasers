import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { DragDropContext } from "@hello-pangea/dnd";
import { api } from "@/api/gameClient";
import { useNavigate } from "react-router-dom";
import { computeTotalStats, computeTotalStatsNoBuffs } from "@/lib/statEngine";
import { spring } from "@/lib/goofyMotion";
import { getGuildMembership } from "@/lib/guildUtils";
import { getMyCharacter } from "@/lib/socialEngine";
import StatBar from "@/components/game/StatBar";
import CharacterHeader from "@/components/game/CharacterHeader";
import InventorySlotBoard from "@/components/game/InventorySlotBoard";
import { INVENTORY_DROPPABLE_ID } from "@/components/game/InventoryGrid";
import CollectiblesLog from "@/components/game/CollectiblesLog";
import DerivedStatsPanel from "@/components/game/DerivedStatsPanel";
import { parseEquipDroppableId } from "@/components/game/EquippedFrame";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useInventory } from "@/hooks/useInventory";
import {
  ATTR_STAT_KEYS,
  getAttributePurchaseCount,
  getNextAttributePointCost,
  getInventoryCap,
  STARDUST_COLOR,
} from "@/lib/gameData";
import {
  loadInventoryOrder,
  saveInventoryOrder,
  mergeInventoryOrder,
  reorderIds,
} from "@/lib/inventoryOrder";
import { useToast } from "@/components/ui/use-toast";
import { Sparkles, Backpack } from "lucide-react";
import StardustIcon, { STARDUST_GLYPH } from "@/components/game/StardustIcon";
import { trackStardustSpend } from "@/lib/stardustTracker";

export default function CharacterPage() {
  const [character, setCharacter] = useState(null);
  const [guild, setGuild] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bagOrder, setBagOrder] = useState([]);
  const navigate = useNavigate();
  const characterRef = useRef(null);
  const allocateQueue = useRef(Promise.resolve());
  const lastBrokeToast = useRef(0);

  const inv = useInventory(character, (patch) => {
    setCharacter((c) => {
      const next = { ...c, ...patch };
      characterRef.current = next;
      return next;
    });
  });
  const { toast } = useToast();

  const load = useCallback(async () => {
    const char = await getMyCharacter();
    if (!char) { navigate("/create-character"); return; }
    characterRef.current = char;
    setCharacter(char);
    setLoading(false);
    try {
      const membership = await getGuildMembership(char.id);
      if (membership) setGuild(await api.entities.Guild.get(membership.guild_id));
    } catch (e) { /* guild badge is best-effort */ }
  }, [navigate]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (character) inv.load(); }, [character?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { characterRef.current = character; }, [character]);
  useEffect(() => {
    if (!character?.id) return;
    setBagOrder(loadInventoryOrder(character.id));
  }, [character?.id]);
  useEffect(() => {
    if (!character?.id) return;
    const ids = inv.items.filter((i) => !i.is_equipped).map((i) => i.id);
    setBagOrder((prev) => {
      const next = mergeInventoryOrder(prev, ids);
      if (next.length === prev.length && next.every((id, i) => id === prev[i])) return prev;
      saveInventoryOrder(character.id, next);
      return next;
    });
  }, [inv.items, character?.id]);
  useEffect(() => {
    const refresh = () => { if (characterRef.current) inv.load(); };
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [inv.load]);

  function allocate(stat) {
    allocateQueue.current = allocateQueue.current.then(() => doAllocate(stat)).catch(() => {});
  }

  async function doAllocate(stat) {
    const char = characterRef.current;
    if (!char) return;
    const cost = getNextAttributePointCost(char, stat);
    const sd = char.stardust || 0;
    if (sd < cost) {
      const now = Date.now();
      if (now - lastBrokeToast.current > 900) {
        lastBrokeToast.current = now;
        toast({
          title: "Not enough Stardust",
          description: `Next ${stat} costs ${STARDUST_GLYPH}${cost.toLocaleString()}`,
          variant: "destructive",
        });
      }
      return;
    }
    const bought = getAttributePurchaseCount(char, stat);
    const byStat = {
      ...(char.attribute_purchases_by_stat || {}),
      [stat]: bought + 1,
    };
    for (const k of ATTR_STAT_KEYS) {
      if (typeof byStat[k] !== "number") byStat[k] = getAttributePurchaseCount(char, k);
    }
    byStat[stat] = bought + 1;
    const totalBought = ATTR_STAT_KEYS.reduce((s, k) => s + (byStat[k] || 0), 0);
    const optimistic = {
      stats: { ...char.stats, [stat]: (char.stats[stat] || 0) + 1 },
      stardust: sd - cost,
      attribute_purchases_by_stat: byStat,
      attribute_purchases: totalBought,
    };
    const next = { ...char, ...optimistic };
    characterRef.current = next;
    setCharacter(next);
    try {
      const res = await api.functions.invoke("BuyAttribute", { stat });
      const patch = res.patch || res.data?.patch || {};
      const synced = { ...characterRef.current, ...patch };
      characterRef.current = synced;
      setCharacter(synced);
      void trackStardustSpend(char, cost, "attribute");
    } catch (e) {
      toast({ title: "Purchase failed", description: e.message, variant: "destructive" });
      await load();
    }
  }

  async function handleUse(item) {
    const res = await inv.useConsumable(item);
    if (res?.ok) {
      toast({ title: `🧪 Used ${item.name}`, description: "Buff applied." });
      return;
    }
    if (res?.reason) {
      toast({ title: "Can't use", description: res.reason, variant: "destructive" });
    }
  }

  async function handleSell(item) {
    try {
      await inv.sell(item);
    } catch (e) {
      toast({ title: "Could not dissolve", description: e?.message || "Try again.", variant: "destructive" });
    }
  }

  async function handleBulkSell(items) {
    try {
      return await inv.bulkSell(items);
    } catch (e) {
      toast({ title: "Could not dissolve junk", description: e?.message || "Try again.", variant: "destructive" });
      return 0;
    }
  }

  async function handleEquip(item) {
    try {
      await inv.equip(item);
    } catch (e) {
      toast({ title: "Equip failed", description: e?.message || "Try again.", variant: "destructive" });
      await load();
    }
  }

  function onDragEnd(result) {
    const { source, destination, draggableId } = result;
    if (!destination) return;

    const fromEquip = parseEquipDroppableId(source.droppableId);
    const toEquip = parseEquipDroppableId(destination.droppableId);
    const fromBag = source.droppableId === INVENTORY_DROPPABLE_ID;
    const toBag = destination.droppableId === INVENTORY_DROPPABLE_ID;
    const item = inv.items.find((i) => i.id === draggableId);
    if (!item) return;

    if (fromEquip && toBag) {
      if (item.is_equipped) void handleEquip(item);
      return;
    }

    if (fromBag && toEquip) {
      if (!item.is_equipped && item.type === toEquip) void handleEquip(item);
      return;
    }

    if (fromBag && toBag && source.index !== destination.index) {
      const unequippedIds = inv.items.filter((i) => !i.is_equipped).map((i) => i.id);
      const ordered = mergeInventoryOrder(bagOrder, unequippedIds);
      const next = reorderIds(ordered, source.index, destination.index);
      setBagOrder(next);
      if (character?.id) saveInventoryOrder(character.id, next);
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
  const bagCount = inv.items.filter((i) => !i.is_equipped).length;
  const inventoryCap = getInventoryCap(character);
  const bagSlots = Math.min(10, inventoryCap);
  const totalStats = computeTotalStats(character, equippedItems);
  const baseStats = computeTotalStats(character, []);
  const noBuffStats = computeTotalStatsNoBuffs(character, equippedItems);
  const sd = character.stardust || 0;
  const costByStat = Object.fromEntries(
    ATTR_STAT_KEYS.map((k) => [k, getNextAttributePointCost(character, k)]),
  );
  const canBuyAny = ATTR_STAT_KEYS.some((k) => sd >= costByStat[k]);
  const cheapest = Math.min(...ATTR_STAT_KEYS.map((k) => costByStat[k]));
  const fadeUp = (delay = 0) => ({ initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { ...spring, delay } });

  return (
    <DragDropContext onDragEnd={onDragEnd}>
    <div className="flex flex-col md:flex-row gap-3 pt-1.5 md:flex-1 md:min-h-0 md:overflow-hidden">
      {/* Left — large centered hero + compact backpack */}
      <div className="md:flex-1 md:min-h-0 md:overflow-hidden flex flex-col gap-2">
        <div className="flex-1 min-h-0 flex flex-col">
          <CharacterHeader
            character={character}
            guild={guild}
            equippedItems={equippedItems}
            onEquip={handleEquip}
            onLock={inv.toggleLock}
            onUpdate={(updater) => setCharacter((c) => {
              const next = typeof updater === "function" ? updater(c) : updater;
              characterRef.current = next;
              return next;
            })}
          />
        </div>

        <motion.div
          {...fadeUp(0.08)}
          className="shrink-0 bg-card/40 backdrop-blur-sm border border-border/50 rounded-2xl px-2.5 py-2"
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <Backpack className="w-3.5 h-3.5 text-amber-600/90" />
            <h2 className="font-display font-semibold text-[10px] tracking-wider text-muted-foreground">
              BACKPACK
            </h2>
            <span className={`ml-auto text-[10px] tabular-nums font-display ${bagCount >= inventoryCap ? "text-amber-400" : "text-muted-foreground"}`}>
              {bagCount}/{inventoryCap}
            </span>
          </div>
          <InventorySlotBoard
            items={inv.items}
            bagOrder={bagOrder}
            slotCount={bagSlots}
            onEquip={handleEquip}
            onSell={handleSell}
            onBulkSell={handleBulkSell}
            onUse={handleUse}
            onLock={inv.toggleLock}
            characterClass={character.class}
          />
        </motion.div>
      </div>

      {/* Right — stardust attribute upgrades (primary) */}
      <div className="md:w-[42%] lg:w-[40%] xl:w-[38%] md:min-h-0 md:flex md:flex-col md:gap-3 space-y-3 md:space-y-0">
        <motion.div
          {...fadeUp(0.05)}
          className={`bg-card/50 backdrop-blur-sm border rounded-2xl p-3.5 flex flex-col min-h-0 md:flex-1 ${
            canBuyAny ? "border-primary/40" : "border-border/50"
          }`}
          style={canBuyAny ? { boxShadow: `0 0 24px ${STARDUST_COLOR}22` } : undefined}
        >
          <div className="flex items-start justify-between gap-3 mb-1.5 shrink-0">
            <div>
              <h2 className="font-display font-bold text-sm tracking-wide flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" style={{ color: STARDUST_COLOR }} />
                ATTRIBUTE UPGRADES
              </h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Spend stardust to permanently raise an attribute. Hold to keep buying.
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Your stardust</p>
              <p className="font-display font-black text-lg tabular-nums inline-flex items-center gap-1" style={{ color: STARDUST_COLOR }}>
                <StardustIcon className="w-4 h-4" />
                {sd.toLocaleString()}
              </p>
              {!canBuyAny && (
                <p className="text-[9px] text-muted-foreground mt-0.5">
                  Need {STARDUST_GLYPH}{cheapest.toLocaleString()}+
                </p>
              )}
            </div>
          </div>

          <TooltipProvider delayDuration={200}>
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-1">
              {Object.entries(totalStats).map(([stat, val]) => (
                <div key={stat} className="flex-1 min-h-0">
                  <StatBar
                    variant="hero"
                    stat={stat}
                    value={val}
                    base={baseStats[stat]}
                    className={character.class}
                    onAdd={allocate}
                    canAdd={sd >= costByStat[stat]}
                    cost={costByStat[stat]}
                  />
                </div>
              ))}
            </div>

            <div className="mt-1.5 pt-1.5 border-t border-border/30 shrink-0">
              <DerivedStatsPanel
                embedded
                totalStats={totalStats}
                noBuffStats={noBuffStats}
                character={character}
              />
            </div>
          </TooltipProvider>
        </motion.div>

        <motion.div {...fadeUp(0.15)} className="md:shrink-0">
          <CollectiblesLog character={character} />
        </motion.div>
      </div>
    </div>
    </DragDropContext>
  );
}

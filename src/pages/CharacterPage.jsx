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
import InventoryGrid, { INVENTORY_DROPPABLE_ID } from "@/components/game/InventoryGrid";
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
} from "@/lib/gameData";
import {
  loadInventoryOrder,
  saveInventoryOrder,
  mergeInventoryOrder,
  reorderIds,
} from "@/lib/inventoryOrder";
import { useToast } from "@/components/ui/use-toast";
import { Star, Backpack } from "lucide-react";

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
  useEffect(() => { characterRef.current = character; }, [character]);
  useEffect(() => {
    if (!character?.id) return;
    setBagOrder(loadInventoryOrder(character.id));
  }, [character?.id]);
  // Merge freshly granted / looted ids into the local bag order.
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
  // Reload inventory when returning to this tab (e.g. after admin grant).
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
          description: `Next ${stat} costs ✨${cost.toLocaleString()}`,
          variant: "destructive",
        });
      }
      return;
    }
    // Optimistic UI — server BuyAttribute is authoritative.
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
    } catch (e) {
      toast({ title: "Purchase failed", description: e.message, variant: "destructive" });
      await load();
    }
  }

  async function handleUse(item) {
    const res = await inv.useConsumable(item);
    if (res && !res.ok && res.reason) {
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

    // Equipped → bag = unequip
    if (fromEquip && toBag) {
      if (item.is_equipped) void handleEquip(item);
      return;
    }

    // Bag → matching equip slot = equip
    if (fromBag && toEquip) {
      if (!item.is_equipped && item.type === toEquip) void handleEquip(item);
      return;
    }

    // Reorder within bag
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
  const totalStats = computeTotalStats(character, equippedItems);
  const baseStats = computeTotalStats(character, []);
  const noBuffStats = computeTotalStatsNoBuffs(character, equippedItems);
  const sd = character.stardust || 0;
  const costByStat = Object.fromEntries(
    ATTR_STAT_KEYS.map((k) => [k, getNextAttributePointCost(character, k)]),
  );
  const canBuyAny = ATTR_STAT_KEYS.some((k) => sd >= costByStat[k]);
  const fadeUp = (delay = 0) => ({ initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { ...spring, delay } });

  return (
    <DragDropContext onDragEnd={onDragEnd}>
    <div className="flex flex-col md:flex-row gap-3 pt-1.5 md:flex-1 md:min-h-0 md:overflow-hidden">
      {/* Left — header fills space above attributes */}
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
          {...fadeUp(0.05)}
          className={`shrink-0 bg-card/50 backdrop-blur-sm border rounded-2xl px-3.5 py-2.5 flex flex-col ${
            canBuyAny ? "border-primary/40 border-glow-cyan" : "border-border/50"
          }`}
        >
          <div className="flex items-center justify-between gap-3 mb-2 shrink-0">
            <h2 className="font-display font-semibold text-xs tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5 text-primary" /> ATTRIBUTES
            </h2>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-muted-foreground">
                Total{" "}
                <span className="font-display font-bold text-accent">
                  {Object.values(totalStats).reduce((a, b) => a + (b || 0), 0)}
                </span>
              </span>
              <span className="text-muted-foreground tabular-nums">
                ✨{sd.toLocaleString()}
              </span>
            </div>
          </div>

          <TooltipProvider delayDuration={200}>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 shrink-0">
              {Object.entries(totalStats).map(([stat, val]) => (
                <StatBar
                  key={stat}
                  stat={stat}
                  value={val}
                  base={baseStats[stat]}
                  className={character.class}
                  onAdd={allocate}
                  canAdd={sd >= costByStat[stat]}
                  cost={costByStat[stat]}
                />
              ))}
            </div>

            <div className="mt-2.5 pt-2.5 border-t border-border/30 min-h-0">
              <DerivedStatsPanel
                embedded
                totalStats={totalStats}
                noBuffStats={noBuffStats}
                character={character}
              />
            </div>
          </TooltipProvider>
        </motion.div>
      </div>

      {/* Right — inventory & collections */}
      <div className="md:w-[44%] lg:w-[42%] xl:w-[40%] md:min-h-0 md:flex md:flex-col md:gap-3 space-y-3 md:space-y-0">
        <motion.div {...fadeUp(0.35)} className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-4 flex flex-col min-h-0 md:flex-1">
          <h2 className="font-display font-semibold text-xs tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1.5">
            <Backpack className="w-3.5 h-3.5 text-primary" /> INVENTORY
            <span className={`ml-auto tabular-nums ${inv.items.length >= getInventoryCap(character) ? "text-amber-400" : ""}`}>
              {inv.items.length}/{getInventoryCap(character)}
            </span>
          </h2>
          <p className="text-[9px] text-muted-foreground/70 mb-2 italic">
            <span className="hidden [@media(hover:hover)_and_(pointer:fine)]:inline">
              Drag the grip to reorder · drag equipped gear here to unequip · hover to compare.
            </span>
            <span className="[@media(hover:hover)_and_(pointer:fine)]:hidden">
              Drag to reorder · drag equipped gear here to unequip · tap gear to compare.
            </span>
          </p>
          <div className="flex-1 min-h-0 flex flex-col -mr-1 pr-1">
            <InventoryGrid
              items={inv.items}
              bagOrder={bagOrder}
              onEquip={handleEquip}
              onSell={handleSell}
              onBulkSell={handleBulkSell}
              onUse={handleUse}
              onLock={inv.toggleLock}
              characterClass={character.class}
            />
          </div>
        </motion.div>

        <motion.div {...fadeUp(0.4)} className="md:shrink-0">
          <CollectiblesLog character={character} />
        </motion.div>
      </div>
    </div>
    </DragDropContext>
  );
}

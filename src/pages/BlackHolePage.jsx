import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/api/gameClient";
import { useNavigate } from "react-router-dom";
import { computeStardustValue, RARITY_COLORS } from "@/lib/gameData";
import GearVisual from "@/components/game/GearVisual";
import { useToast } from "@/components/ui/use-toast";
import { getMyCharacter } from "@/lib/socialEngine";
import { Orbit } from "lucide-react";
import { getPendingItem, clearPendingItem, subscribePending, getInventoryCap } from "@/lib/inventoryCap";
import { playBlackHoleSuck, playBlackHoleBurst } from "@/lib/blackHoleSfx";

// Stardust particle burst — emitted from the Black Hole when an item dissolves.
function StardustBurst() {
  const particles = useMemo(
    () => Array.from({ length: 16 }, (_, i) => ({
      angle: (i / 16) * Math.PI * 2 + Math.random() * 0.4,
      dist: 50 + Math.random() * 80,
      scale: 0.5 + Math.random() * 0.9,
      delay: Math.random() * 0.06,
    })),
    []
  );
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
      {particles.map((p, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 1, x: 0, y: 0, scale: 0.3 }}
          animate={{ opacity: 0, x: Math.cos(p.angle) * p.dist, y: Math.sin(p.angle) * p.dist, scale: p.scale }}
          transition={{ duration: 0.95, delay: p.delay, ease: "easeOut" }}
          className="absolute text-amber-300"
          style={{ filter: "drop-shadow(0 0 6px #fbbf24)" }}
        >✨</motion.span>
      ))}
      <motion.div
        initial={{ scale: 0.2, opacity: 0.9 }}
        animate={{ scale: 2.4, opacity: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="absolute rounded-full"
        style={{ width: 70, height: 70, background: "radial-gradient(circle, #fff 0%, #fbbf24 40%, transparent 70%)" }}
      />
    </div>
  );
}

export default function BlackHolePage() {
  const [character, setCharacter] = useState(null);
  const [items, setItems] = useState([]);
  const [pending, setPending] = useState(getPendingItem());
  const [loading, setLoading] = useState(true);
  const [holeActive, setHoleActive] = useState(false);
  const [bursts, setBursts] = useState([]);
  const navigate = useNavigate();
  const { toast } = useToast();
  const holeRef = useRef(null);
  const cardRefs = useRef({});

  useEffect(() => subscribePending(setPending), []);

  const load = useCallback(async () => {
    const char = await getMyCharacter();
    if (!char) { navigate("/create-character"); return; }
    setCharacter(char);
    setLoading(false);
    // Spare gear loads best-effort so a hiccup never traps the page.
    try { setItems((await api.entities.Item.filter({ character_id: char.id, is_equipped: false })) || []); } catch (e) {}
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  function spawnBurst() {
    const id = Date.now() + Math.random();
    setBursts((b) => [...b, id]);
    playBlackHoleBurst();
    setTimeout(() => setBursts((b) => b.filter((x) => x !== id)), 1000);
  }

  async function toss(item) {
    const value = computeStardustValue(item);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, _sucking: true } : i));
    playBlackHoleSuck();
    // Stardust erupts from the hole as the item finishes dissolving.
    setTimeout(() => spawnBurst(), 1250);
    setTimeout(async () => {
      await api.entities.Item.delete(item.id);
      await api.entities.Character.update(character.id, { stardust: (character.stardust || 0) + value });
      toast({ title: "✨ Dissolved into stardust!", description: `+${value} stardust from ${item.name}` });
      setCharacter(c => ({ ...c, stardust: (c.stardust || 0) + value }));
      setItems(prev => prev.filter(i => i.id !== item.id));
      // If an item is waiting for room, claim it now that space opened up.
      const p = getPendingItem();
      if (p) {
        const cnt = (await api.entities.Item.filter({ character_id: character.id })).length;
        if (cnt < getInventoryCap(character)) {
          await api.entities.Item.create(p);
          clearPendingItem();
          toast({ title: "📦 Item claimed!", description: `${p.name} joined your inventory.` });
        }
      }
    }, 1400);
  }

  async function sellJunk() {
    const junk = items.filter((i) => !i.locked && !i._sucking && (i.rarity === "common" || i.type === "material"));
    if (!junk.length) {
      toast({ title: "No junk to dissolve", description: "No common gear or materials to feed the void." });
      return;
    }
    const ids = junk.map((i) => i.id);
    const total = junk.reduce((s, i) => s + computeStardustValue(i), 0);
    setItems((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, _sucking: true } : i)));
    playBlackHoleSuck();
    setTimeout(() => spawnBurst(), 1250);
    setTimeout(async () => {
      await api.entities.Item.deleteMany({ id: { $in: ids } });
      await api.entities.Character.update(character.id, { stardust: (character.stardust || 0) + total });
      toast({ title: "✨ Junk dissolved!", description: `${junk.length} items → +${total} stardust` });
      setCharacter((c) => ({ ...c, stardust: (c.stardust || 0) + total }));
      setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
      const p = getPendingItem();
      if (p) {
        const cnt = (await api.entities.Item.filter({ character_id: character.id })).length;
        if (cnt < getInventoryCap(character)) {
          await api.entities.Item.create(p);
          clearPendingItem();
          toast({ title: "📦 Item claimed!", description: `${p.name} joined your inventory.` });
        }
      }
    }, 1400);
  }

  function isOverHole(point) {
    const hole = holeRef.current;
    if (!hole) return false;
    const r = hole.getBoundingClientRect();
    return point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom;
  }

  function handleDragEnd(item, info) {
    setHoleActive(false);
    if (!isOverHole(info.point)) return;
    // Compute the translate needed to fly the card into the hole's center.
    const hole = holeRef.current;
    const cardEl = cardRefs.current[item.id];
    let target = null;
    if (hole && cardEl) {
      const r = hole.getBoundingClientRect();
      const cr = cardEl.getBoundingClientRect();
      const dx = (r.left + r.width / 2) - (cr.left + cr.width / 2);
      const dy = (r.top + r.height / 2) - (cr.top + cr.height / 2);
      target = { x: dx + info.offset.x, y: dy + info.offset.y };
    }
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, _suckTarget: target } : i));
    toss(item);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 16 }}
        className="flex items-center justify-between"
      >
        <h1 className="font-display font-bold text-xl tracking-wider flex items-center gap-2">
          <Orbit className="w-5 h-5 text-accent" /> Black Hole
        </h1>
        <span className="flex items-center gap-1.5 text-sm font-display font-bold px-3 py-1 rounded-full bg-accent/10 text-accent border border-accent/30">
          ✨ {character.stardust || 0}
          <span className="text-[10px] text-muted-foreground font-normal">stardust</span>
        </span>
      </motion.div>

      {/* Pending item — waiting for room after an inventory-full pickup */}
      {pending && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3">
          <span className="text-xl">📦</span>
          <div className="flex-1">
            <p className="font-display font-bold text-sm text-primary">Item Waiting: {pending.name}</p>
            <p className="text-xs text-muted-foreground">Dissolve gear below to make room — it'll be added automatically.</p>
          </div>
        </div>
      )}

      {/* The Black Hole — drag target */}
      <div
        ref={holeRef}
        className={`relative rounded-2xl overflow-hidden painted-panel canvas-grain flex items-center justify-center transition-shadow duration-300 ${holeActive ? "shadow-[0_0_40px_rgba(157,108,255,0.6)]" : ""}`}
        style={{ minHeight: 240 }}
      >
        <motion.div
          className="absolute rounded-full"
          style={{ width: 180, height: 180, background: "radial-gradient(circle, #000 28%, rgba(157,108,255,0.55) 55%, transparent 75%)" }}
          animate={{ rotate: 360, scale: holeActive ? [1, 1.12, 1] : [1, 1.06, 1] }}
          transition={{ rotate: { duration: 8, repeat: Infinity, ease: "linear" }, scale: { duration: 3, repeat: Infinity, ease: "easeInOut" } }}
        />
        <motion.div
          className={`absolute rounded-full border-2 transition-colors ${holeActive ? "border-accent" : "border-accent/40"}`}
          style={{ width: 250, height: 250 }}
          animate={{ rotate: -360 }}
          transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute rounded-full border border-primary/30"
          style={{ width: 320, height: 320 }}
          animate={{ rotate: 360 }}
          transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
        />
        <AnimatePresence>
          {bursts.map((id) => <StardustBurst key={id} />)}
        </AnimatePresence>
        <p className="relative z-10 text-center font-display tracking-widest text-xs text-muted-foreground uppercase pt-36">
          {holeActive ? "Release to dissolve" : "Drag gear in to dissolve into stardust"}
        </p>
      </div>

      {(() => {
        const junkCount = items.filter((i) => !i.locked && (i.rarity === "common" || i.type === "material")).length;
        return (
          <div className="flex justify-end">
            <button
              onClick={sellJunk}
              disabled={junkCount === 0}
              className="text-xs bg-amber-500/10 text-amber-300 border border-amber-500/30 px-3 py-1.5 rounded-lg font-display font-semibold hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Toss Junk ({junkCount})
            </button>
          </div>
        );
      })()}

      {items.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="bg-card/50 border border-border/50 rounded-2xl p-8 text-center painted-panel"
        >
          <p className="text-sm text-muted-foreground">No spare gear to dissolve.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Complete missions or buy from the shop to find items.</p>
        </motion.div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <AnimatePresence>
            {items.map(item => (
              <motion.div
                key={item.id}
                layout
                drag={!item._sucking}
                dragElastic={0.5}
                whileDrag={{ zIndex: 60, scale: 1.06, cursor: "grabbing" }}
                onDrag={(_, info) => {
                  const over = isOverHole(info.point);
                  setHoleActive((cur) => (cur === over ? cur : over));
                }}
                onDragEnd={(_, info) => handleDragEnd(item, info)}
                initial={{ opacity: 0, scale: 0.85, y: 14 }}
                animate={item._sucking
                  ? { opacity: 0, scale: 0, rotate: 1440, x: item._suckTarget?.x ?? 0, y: item._suckTarget?.y ?? 0, filter: "blur(10px)" }
                  : { opacity: 1, scale: 1, x: 0, y: 0 }
                }
                exit={{ opacity: 0, scale: 0, filter: "blur(10px)" }}
                transition={item._sucking
                  ? { duration: 1.4, ease: "easeIn" }
                  : { type: "spring", stiffness: 400, damping: 18 }
                }
                ref={(el) => { if (el) cardRefs.current[item.id] = el; }}
                className="py-1.5 px-2 rounded-lg border bg-card/60 backdrop-blur-sm flex items-center gap-2 relative cursor-grab active:cursor-grabbing"
                style={{ borderColor: (RARITY_COLORS[item.rarity] || "#9CA3AF") + "40", zIndex: item._sucking ? 40 : 0 }}
              >
                <GearVisual type={item.type} rarity={item.rarity} name={item.name} emoji={item.emoji} size={34} />
                <div className="flex-1 min-w-0">
                  <h4 className="font-display font-semibold text-xs truncate leading-tight" style={{ color: RARITY_COLORS[item.rarity] }}>{item.name}</h4>
                  <p className="text-[11px] text-muted-foreground capitalize leading-tight">{item.rarity} · {item.type}</p>
                  <p className="text-[11px] text-accent font-medium leading-tight">✨ {computeStardustValue(item)}</p>
                </div>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => toss(item)}
                  className="shrink-0 text-[11px] bg-accent/15 hover:bg-accent/25 text-accent px-2.5 py-1 rounded-md font-display font-semibold tracking-wide"
                >
                  Toss
                </motion.button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
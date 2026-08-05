import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { getMyCharacter, primeMyCharacterCache } from "@/lib/socialEngine";
import { Gem, Sparkles, Crown, Check, Zap, Star } from "lucide-react";
import WeeklyNovaQuests from "@/components/game/WeeklyNovaQuests";

/** Display catalog — grants match server NOVA_PACKAGES (pack_2…pack_100). */
const PACKAGES = [
  {
    id: "pack_2",
    name: "Signal Shard",
    blurb: "A scout’s first haul from the fringe.",
    crystals: 275,
    price: "$1.99",
    usd: 1.99,
    color: "#67E8F9",
    tier: "spark",
  },
  {
    id: "pack_5",
    name: "Ember Pouch",
    blurb: "Warm crystals still humming from the kiln.",
    crystals: 850,
    price: "$4.99",
    usd: 4.99,
    color: "#22D3EE",
    tier: "ember",
  },
  {
    id: "pack_10",
    name: "Cosmic Cluster",
    blurb: "The operative favorite — dense and loud.",
    crystals: 1950,
    price: "$9.99",
    usd: 9.99,
    color: "#C084FC",
    tier: "cluster",
    popular: true,
  },
  {
    id: "pack_20",
    name: "Stellar Vault",
    blurb: "Sealed under guild wax for serious runs.",
    crystals: 4500,
    price: "$19.99",
    usd: 19.99,
    color: "#FBBF24",
    tier: "vault",
  },
  {
    id: "pack_50",
    name: "Void Motherlode",
    blurb: "Salvaged from a dark-sector freighter.",
    crystals: 12750,
    price: "$49.99",
    usd: 49.99,
    color: "#FB7185",
    tier: "motherlode",
  },
  {
    id: "pack_100",
    name: "Hypernova Cache",
    blurb: "Fleet-scale payload. Maximum yield.",
    crystals: 30000,
    price: "$99.99",
    usd: 99.99,
    color: "#FDE68A",
    tier: "hypernova",
    bestValue: true,
  },
];

const USES = [
  { icon: "🎨", title: "Cosmetics", desc: "Ship skins, avatar auras & taunts" },
  { icon: "⚡", title: "Convenience", desc: "Fuel refills, instant mission completes" },
  { icon: "🐾", title: "Cosmic Pets", desc: "Companions with passive bonuses" },
];

function valueBonusPct(pkg, baseRate) {
  const rate = pkg.crystals / pkg.usd;
  return Math.max(0, Math.round((rate / baseRate - 1) * 100));
}

export default function CrystalStorePage() {
  const outlet = useOutletContext() || {};
  const setSharedCharacter = outlet.setCharacter;
  const [localCharacter, setLocalCharacter] = useState(null);
  const character = outlet.character || localCharacter;
  const [loading, setLoading] = useState(!outlet.character);
  const navigate = useNavigate();
  const { toast } = useToast();

  const baseRate = useMemo(() => PACKAGES[0].crystals / PACKAGES[0].usd, []);
  const featured = useMemo(
    () => PACKAGES.filter((p) => p.popular || p.bestValue),
    [],
  );
  const shelf = useMemo(
    () => PACKAGES.filter((p) => !p.popular && !p.bestValue),
    [],
  );

  const applyCharacter = useCallback((next) => {
    if (!next) return;
    primeMyCharacterCache(next);
    if (typeof setSharedCharacter === "function") setSharedCharacter(next);
    setLocalCharacter(next);
  }, [setSharedCharacter]);

  const load = useCallback(async () => {
    const char = await getMyCharacter();
    if (!char) { navigate("/create-character"); return; }
    applyCharacter(char);
    setLoading(false);
  }, [navigate, applyCharacter]);

  useEffect(() => {
    if (outlet.character) {
      setLocalCharacter(outlet.character);
      setLoading(false);
      return;
    }
    load();
  }, [outlet.character, load]);

  function handleBuy(pkg) {
    toast({
      title: "🔒 Checkout coming soon",
      description: `${pkg.name} (${pkg.crystals.toLocaleString()} 💎) — Stripe payment is being connected.`,
    });
  }

  if (loading || !character) {
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
        className="flex items-center justify-between flex-wrap gap-3"
      >
        <div>
          <h1 className="font-display font-bold text-xl tracking-wider flex items-center gap-2">
            <Gem className="w-5 h-5 text-amber-300" /> Crystal Store
          </h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Under-table Nova drops · six sealed crates · pay what the fence quotes
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-sm font-display font-bold px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">
          <Gem className="w-4 h-4" /> {(character.nova_crystals || 0).toLocaleString()}{" "}
          <span className="text-xs font-normal text-muted-foreground">Nova Crystals</span>
        </span>
      </motion.div>

      <WeeklyNovaQuests character={character} onClaimed={applyCharacter} />

      {/* Featured: Popular + Best Value */}
      <section className="space-y-2">
        <h2 className="text-[10px] font-display font-bold tracking-[0.18em] uppercase text-muted-foreground flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-amber-300" /> Featured Contraband
        </h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {featured.map((pkg, i) => (
            <FeaturedPackCard
              key={pkg.id}
              pkg={pkg}
              bonus={valueBonusPct(pkg, baseRate)}
              delay={i * 0.06}
              onBuy={() => handleBuy(pkg)}
            />
          ))}
        </div>
      </section>

      {/* Full shelf — ascending crystal vein */}
      <section className="space-y-2">
        <h2 className="text-[10px] font-display font-bold tracking-[0.18em] uppercase text-muted-foreground flex items-center gap-1.5">
          <Star className="w-3.5 h-3.5 text-cyan-300" /> Crystal Assay Shelf
        </h2>
        <div className="relative rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/[0.06] via-card/40 to-amber-500/[0.07] p-3 sm:p-4 overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 30%, #67E8F9 0, transparent 45%), radial-gradient(circle at 80% 70%, #FBBF24 0, transparent 40%)",
            }}
          />
          <div className="relative grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {shelf.map((pkg, i) => (
              <ShelfPackCard
                key={pkg.id}
                pkg={pkg}
                bonus={valueBonusPct(pkg, baseRate)}
                delay={0.08 + i * 0.05}
                onBuy={() => handleBuy(pkg)}
              />
            ))}
          </div>
        </div>
      </section>

      <div>
        <h2 className="text-xs font-display font-semibold text-muted-foreground tracking-wide mb-3 flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5" /> WHAT NOVA CRYSTALS UNLOCK
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {USES.map((u, i) => (
            <motion.div
              key={u.title}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.05 }}
              className="p-3 rounded-lg border border-border/40 bg-muted/10"
            >
              <div className="text-2xl mb-1">{u.icon}</div>
              <h4 className="font-display font-semibold text-sm">{u.title}</h4>
              <p className="text-[11px] text-muted-foreground">{u.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        <Check className="w-3 h-3 inline mr-1 text-green-400" /> Real purchases activate once Stripe checkout is connected.
      </p>
    </div>
  );
}

function FeaturedPackCard({ pkg, bonus, delay, onBuy }) {
  const isBest = !!pkg.bestValue;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 18, delay }}
      whileHover={{ y: -3 }}
      className="relative overflow-hidden rounded-2xl border p-4 sm:p-5 flex flex-col sm:flex-row gap-4 items-stretch"
      style={{
        borderColor: `${pkg.color}55`,
        background: isBest
          ? `linear-gradient(135deg, ${pkg.color}22, rgba(15,18,28,0.92) 45%, ${pkg.color}14)`
          : `linear-gradient(135deg, ${pkg.color}18, rgba(15,18,28,0.9) 50%)`,
        boxShadow: `0 0 28px ${pkg.color}22`,
      }}
    >
      <div className="absolute top-3 right-3 flex items-center gap-1 text-[9px] font-display font-bold px-2 py-0.5 rounded-full border"
        style={{
          background: isBest ? "rgba(253,230,138,0.18)" : "rgba(245,158,11,0.18)",
          color: isBest ? "#FDE68A" : "#FCD34D",
          borderColor: isBest ? "rgba(253,230,138,0.45)" : "rgba(245,158,11,0.4)",
        }}
      >
        {isBest ? <Star className="w-2.5 h-2.5" /> : <Crown className="w-2.5 h-2.5" />}
        {isBest ? "BEST VALUE" : "POPULAR"}
      </div>

      <div className="flex items-center justify-center sm:w-[38%] shrink-0">
        <motion.div
          animate={{ y: [0, -5, 0], rotate: [0, 4, 0] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          className="w-20 h-20 rounded-2xl flex items-center justify-center relative"
          style={{
            background: `radial-gradient(circle, ${pkg.color}55, transparent 70%)`,
            boxShadow: `0 0 32px ${pkg.color}50`,
          }}
        >
          <Gem className="w-10 h-10" style={{ color: pkg.color }} />
          {isBest && (
            <span className="absolute -bottom-1 text-[9px] font-display font-black tracking-widest text-amber-200/90">
              MAX YIELD
            </span>
          )}
        </motion.div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 pt-1">
        <h3 className="font-display font-bold text-lg" style={{ color: pkg.color }}>{pkg.name}</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">{pkg.blurb}</p>
        <p className="text-3xl font-display font-black mt-2 tabular-nums leading-none">
          {pkg.crystals.toLocaleString()}
          <span className="text-xs font-normal text-muted-foreground ml-1.5">Nova</span>
        </p>
        {bonus > 0 && (
          <span className="mt-2 w-fit text-[10px] font-display font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30">
            +{bonus}% vs Signal Shard
          </span>
        )}
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onBuy}
          className="mt-auto w-full sm:w-auto sm:self-start mt-4 px-5 py-2.5 rounded-lg font-display font-bold text-sm tracking-wide painted-btn text-black/90"
          style={{ background: `linear-gradient(180deg, ${pkg.color}, ${pkg.color}bb)` }}
        >
          {pkg.price}
        </motion.button>
      </div>
    </motion.div>
  );
}

function ShelfPackCard({ pkg, bonus, delay, onBuy }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 17, delay }}
      whileHover={{ y: -4 }}
      className="relative p-3.5 rounded-xl border bg-background/55 backdrop-blur-sm flex flex-col overflow-hidden min-h-[240px]"
      style={{
        borderColor: `${pkg.color}45`,
        boxShadow: `0 0 16px ${pkg.color}16`,
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: `linear-gradient(90deg, transparent, ${pkg.color}, transparent)` }}
      />

      <div className="flex items-center justify-center mb-2 mt-1">
        <motion.div
          animate={{ y: [0, -3, 0] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", delay }}
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{
            background: `radial-gradient(circle, ${pkg.color}40, transparent)`,
            boxShadow: `0 0 14px ${pkg.color}35`,
          }}
        >
          <Gem className="w-6 h-6" style={{ color: pkg.color }} />
        </motion.div>
      </div>

      <h3 className="font-display font-semibold text-sm text-center" style={{ color: pkg.color }}>
        {pkg.name}
      </h3>
      <p className="text-[10px] text-muted-foreground text-center mt-0.5 leading-snug min-h-[28px]">
        {pkg.blurb}
      </p>

      <p className="text-2xl font-display font-black text-center mt-1 tabular-nums">
        {pkg.crystals.toLocaleString()}
      </p>
      <p className="text-[10px] text-muted-foreground text-center -mt-0.5">Nova Crystals</p>

      <div className="mt-1.5 flex justify-center min-h-[22px]">
        {bonus > 0 ? (
          <span className="text-[10px] font-display font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30">
            +{bonus}% value
          </span>
        ) : (
          <span className="text-[10px] font-display font-semibold px-2 py-0.5 rounded-full bg-muted/30 text-muted-foreground border border-border/40">
            Entry crate
          </span>
        )}
      </div>

      <p className="text-[10px] text-center text-muted-foreground/80 mt-1 tabular-nums">
        ~{Math.round(pkg.crystals / pkg.usd)} 💎 / $
      </p>

      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={onBuy}
        className="mt-auto w-full mt-3 py-2 rounded-lg font-display font-bold text-sm tracking-wide painted-btn text-black/90"
        style={{ background: `linear-gradient(180deg, ${pkg.color}, ${pkg.color}cc)` }}
      >
        {pkg.price}
      </motion.button>
    </motion.div>
  );
}

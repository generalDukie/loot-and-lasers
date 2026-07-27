import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { api } from "@/api/gameClient";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { getMyCharacter } from "@/lib/socialEngine";
import { Gem, Sparkles, Crown, Check } from "lucide-react";

const PACKAGES = [
  { id: "pouch", name: "Starter Pouch", crystals: 500, price: "$4.99", bonus: null, color: "#22D3EE" },
  { id: "cluster", name: "Cosmic Cluster", crystals: 1200, price: "$9.99", bonus: "+20%", color: "#A855F7", popular: true },
  { id: "vault", name: "Stellar Vault", crystals: 2800, price: "$19.99", bonus: "+25%", color: "#F59E0B" },
  { id: "motherlode", name: "Galactic Motherlode", crystals: 6000, price: "$39.99", bonus: "+33%", color: "#EF4444" },
];

const USES = [
  { icon: "🎨", title: "Cosmetics", desc: "Ship skins, avatar auras & taunts" },
  { icon: "⚡", title: "Convenience", desc: "Fuel refills, instant mission completes" },

  { icon: "🐾", title: "Cosmic Pets", desc: "Companions with passive bonuses" },
];

export default function CrystalStorePage() {
  const [character, setCharacter] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  const load = useCallback(async () => {
    const char = await getMyCharacter();
    if (!char) { navigate("/create-character"); return; }
    setCharacter(char);
    setLoading(false);
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  function handleBuy(pkg) {
    toast({
      title: "🔒 Checkout coming soon",
      description: `${pkg.name} (${pkg.crystals.toLocaleString()} 💎) — Stripe payment is being connected.`,
    });
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
        className="flex items-center justify-between flex-wrap gap-3"
      >
        <h1 className="font-display font-bold text-xl tracking-wider flex items-center gap-2">
          <Gem className="w-5 h-5 text-amber-300" /> Crystal Store
        </h1>
        <span className="flex items-center gap-1.5 text-sm font-display font-bold px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">
          <Gem className="w-4 h-4" /> {character.nova_crystals || 0} <span className="text-xs font-normal text-muted-foreground">Nova Crystals</span>
        </span>
      </motion.div>

      {/* Packages */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PACKAGES.map((pkg, i) => (
          <motion.div
            key={pkg.id}
            initial={{ opacity: 0, scale: 0.85, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 16, delay: i * 0.05 }}
            whileHover={{ y: -4 }}
            className="relative p-4 rounded-xl border bg-card/60 backdrop-blur-sm flex flex-col overflow-hidden"
            style={{ borderColor: pkg.color + "40", boxShadow: `0 0 14px ${pkg.color}18` }}
          >
            {pkg.popular && (
              <div className="absolute top-2 right-2 flex items-center gap-1 text-[9px] font-display font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                <Crown className="w-2.5 h-2.5" /> POPULAR
              </div>
            )}
            <div className="flex items-center justify-center mb-3">
              <motion.div
                animate={{ y: [0, -4, 0], rotate: [0, 3, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="w-14 h-14 rounded-xl flex items-center justify-center"
                style={{ background: `radial-gradient(circle, ${pkg.color}40, transparent)`, boxShadow: `0 0 18px ${pkg.color}40` }}
              >
                <Gem className="w-7 h-7" style={{ color: pkg.color }} />
              </motion.div>
            </div>

            <h3 className="font-display font-semibold text-sm text-center" style={{ color: pkg.color }}>{pkg.name}</h3>
            <p className="text-2xl font-display font-black text-center mt-1">{pkg.crystals.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground text-center -mt-0.5">Nova Crystals</p>

            {pkg.bonus && (
              <div className="text-center mt-1">
                <span className="text-[10px] font-display font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30">
                  {pkg.bonus} BONUS
                </span>
              </div>
            )}

            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => handleBuy(pkg)}
              className="mt-auto w-full mt-3 py-2 rounded-lg font-display font-bold text-sm tracking-wide painted-btn"
              style={{ background: `linear-gradient(180deg, ${pkg.color}, ${pkg.color}cc)` }}
            >
              {pkg.price}
            </motion.button>
          </motion.div>
        ))}
      </div>

      {/* What you can spend them on */}
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
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, Gem, Fuel, Sparkles, Package, Check, Loader2 } from "lucide-react";
import StardustIcon from "@/components/game/StardustIcon";
import { FUEL_COLOR, STARDUST_COLOR } from "@/lib/gameData";
import { summarizeRewards } from "@/lib/mailUi";

function RewardCard({ icon: Icon, label, value, color, claimed }) {
  return (
    <motion.div
      layout
      className="relative flex flex-col items-center gap-1.5 p-3 rounded-xl border min-w-[5.5rem] flex-1"
      style={{
        borderColor: claimed ? "hsl(150 50% 40% / 0.35)" : `${color}55`,
        background: claimed
          ? "hsl(150 40% 18% / 0.25)"
          : `linear-gradient(160deg, ${color}22, hsl(230 25% 10% / 0.7))`,
        boxShadow: claimed ? undefined : `0 0 16px ${color}22`,
        opacity: claimed ? 0.75 : 1,
      }}
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center border"
        style={{
          borderColor: `${color}66`,
          background: `${color}18`,
          color,
        }}
      >
        {Icon === "stardust" ? (
          <StardustIcon className="w-6 h-6" glow={!claimed} />
        ) : (
          <Icon className="w-5 h-5" style={{ color }} />
        )}
      </div>
      <p className="text-[10px] font-display tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="text-sm font-display font-bold tabular-nums" style={{ color: claimed ? "hsl(150 60% 70%)" : color }}>
        {value}
      </p>
      {claimed && (
        <span className="absolute top-1.5 right-1.5 text-[8px] font-display uppercase tracking-wider text-emerald-300/90">
          Claimed
        </span>
      )}
    </motion.div>
  );
}

/**
 * Attractive reward attachment strip + claim CTA.
 */
export default function MailRewardPanel({ mail, onClaim, claiming = false }) {
  const [burst, setBurst] = useState(false);
  const rewards = mail?.rewards || {};
  const claimed = !!mail?.claimed;
  const expired = mail?.expires_at && new Date(mail.expires_at) < new Date();
  const cards = [];

  if (rewards.stardust) {
    cards.push({
      key: "sd",
      icon: "stardust",
      label: "Stardust",
      value: Number(rewards.stardust).toLocaleString(),
      color: STARDUST_COLOR,
    });
  }
  if (rewards.nova_crystals) {
    cards.push({
      key: "nova",
      icon: Gem,
      label: "Nova",
      value: String(rewards.nova_crystals),
      color: "#FFD700",
    });
  }
  if (rewards.fuel) {
    cards.push({
      key: "fuel",
      icon: Fuel,
      label: "Fuel",
      value: String(rewards.fuel),
      color: FUEL_COLOR,
    });
  }
  if (rewards.item_rarity) {
    cards.push({
      key: "gear",
      icon: Package,
      label: "Gear",
      value: String(rewards.item_rarity),
      color: "#60A5FA",
    });
  }
  if (rewards.collectible) {
    cards.push({
      key: "col",
      icon: Sparkles,
      label: "Find",
      value: rewards.collectible.name || "Item",
      color: "#A78BFA",
    });
  }
  if (!cards.length && mail?.has_rewards) {
    cards.push({
      key: "pkg",
      icon: Gift,
      label: "Package",
      value: "Attached",
      color: "#FBBF24",
    });
  }

  async function handleClaim() {
    if (claimed || expired || claiming) return;
    setBurst(true);
    try {
      await onClaim?.();
    } finally {
      setTimeout(() => setBurst(false), 700);
    }
  }

  return (
    <div
      className="relative rounded-2xl border p-4 overflow-hidden"
      style={{
        borderColor: claimed ? "hsl(150 50% 40% / 0.35)" : "hsl(40 70% 45% / 0.45)",
        background: claimed
          ? "linear-gradient(160deg, hsl(150 35% 16% / 0.35), hsl(230 25% 10% / 0.5))"
          : "linear-gradient(160deg, hsl(40 50% 18% / 0.35), hsl(230 25% 10% / 0.55))",
        boxShadow: claimed ? undefined : "0 0 28px hsl(40 90% 50% / 0.12)",
      }}
    >
      <AnimatePresence>
        {burst && (
          <motion.div
            initial={{ opacity: 0.8, scale: 0.6 }}
            animate={{ opacity: 0, scale: 1.6 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.65 }}
            className="pointer-events-none absolute inset-0 rounded-2xl"
            style={{
              background: "radial-gradient(circle at 50% 50%, hsl(40 90% 55% / 0.35), transparent 65%)",
            }}
          />
        )}
      </AnimatePresence>

      <div className="flex items-center gap-2 mb-3">
        <Gift className={`w-4 h-4 ${claimed ? "text-emerald-300" : "text-amber-300"}`} />
        <p className="font-display font-bold text-sm tracking-wide">
          {claimed ? "Package Claimed" : "Attached Transmission Package"}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {cards.map((c) => (
          <RewardCard key={c.key} {...c} claimed={claimed} />
        ))}
      </div>

      {!cards.length && (
        <p className="text-xs text-muted-foreground mb-2">{summarizeRewards(rewards)}</p>
      )}

      {mail.expires_at && (
        <p className={`text-[10px] mb-2 ${expired ? "text-rose-300" : "text-muted-foreground"}`}>
          {expired ? "Expired · " : "Expires · "}
          {new Date(mail.expires_at).toLocaleDateString()}
        </p>
      )}

      {!claimed && !expired && (
        <button
          type="button"
          onClick={handleClaim}
          disabled={claiming}
          className="mail-claim-btn w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-display font-bold text-sm tracking-wide transition-all duration-150 disabled:opacity-50"
          style={{
            background: "linear-gradient(180deg, hsl(40 90% 55%), hsl(32 90% 42%))",
            color: "hsl(30 40% 8%)",
            boxShadow: "0 4px 0 hsl(32 80% 28%), 0 0 18px hsl(40 90% 50% / 0.35)",
            border: "1px solid hsl(40 90% 65% / 0.5)",
          }}
        >
          {claiming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
          {claiming ? "Claiming…" : "Claim Rewards"}
        </button>
      )}

      {claimed && (
        <div className="inline-flex items-center gap-1.5 text-xs font-display font-semibold text-emerald-300">
          <Check className="w-3.5 h-3.5" />
          Claimed — added to your wallet & inventory
        </div>
      )}
    </div>
  );
}

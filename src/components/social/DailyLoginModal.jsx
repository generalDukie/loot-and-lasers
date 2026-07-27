import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Gift, Check } from "lucide-react";
import { DAILY_REWARDS, getProgress, canClaimToday, claimDaily, rewardIcon, rewardLabel, todayUTC } from "@/lib/dailyLoginEngine";
import { useToast } from "@/components/ui/use-toast";

export default function DailyLoginModal({ open, onClose, myChar, onClaimed }) {
  const [progress, setProgress] = useState(null);
  const [claiming, setClaiming] = useState(null);
  const [now, setNow] = useState(Date.now());
  const { toast } = useToast();

  useEffect(() => {
    if (!open || !myChar) return;
    getProgress(myChar.id).then(setProgress);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open, myChar]);

  if (!open) return null;

  const claimable = canClaimToday(progress);
  const currentDay = progress?.current_day || 1;
  const claimedSet = new Set(progress?.claimed_days || []);
  const today = todayUTC();
  const lastClaim = progress?.last_claim_date;

  // Time until next server day (UTC midnight)
  const nextDay = new Date();
  nextDay.setUTCHours(24, 0, 0, 0);
  const msLeft = Math.max(0, nextDay - now);
  const hh = String(Math.floor(msLeft / 3600000)).padStart(2, "0");
  const mm = String(Math.floor((msLeft % 3600000) / 60000)).padStart(2, "0");
  const ss = String(Math.floor((msLeft % 60000) / 1000)).padStart(2, "0");

  async function claim() {
    setClaiming(true);
    try {
      const res = await claimDaily();
      setProgress(res.progress);
      toast({ title: `Day ${res.claimed_day} claimed!`, description: rewardLabel(res.rewards) });
      onClaimed?.(res);
      onClose();
    } catch (e) {
      toast({ title: "Already claimed today", description: e?.response?.data?.error, variant: "destructive" });
      if (e?.response?.data?.progress) setProgress(e.response.data.progress);
    } finally {
      setClaiming(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[80] flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
        <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60 }}
          className="relative w-full max-w-lg rounded-2xl border border-border/60 painted-panel canvas-grain p-5 max-h-[90vh] overflow-y-auto">
          <button onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground z-10"><X className="w-4 h-4" /></button>

          <div className="text-center mb-4">
            <motion.div animate={{ rotate: [-6, 6, -6] }} transition={{ duration: 2.5, repeat: Infinity }} className="text-4xl mb-1">🎁</motion.div>
            <h2 className="font-display font-bold text-lg tracking-wide">Daily Login Rewards</h2>
            <p className="text-xs text-muted-foreground">{progress?.cycle_theme || "Stardust Voyage"} · Streak: {claimedSet.size} day{claimedSet.size !== 1 ? "s" : ""}</p>
          </div>

          <div className="grid grid-cols-5 gap-1.5 mb-4">
            {DAILY_REWARDS.map((entry) => {
              const claimed = claimedSet.has(entry.day);
              const isToday = entry.day === currentDay && claimable;
              const isPast = claimedSet.has(entry.day) || (entry.day < currentDay && !claimable);
              const locked = entry.day > currentDay || (entry.day === currentDay && !claimable && lastClaim === today);
              return (
                <div key={entry.day} className={`relative aspect-square rounded-lg border flex flex-col items-center justify-center p-1 text-center
                  ${claimed ? "border-green-500/40 bg-green-500/10" : isToday ? "border-amber-400/60 bg-amber-500/10 animate-pulse" : locked ? "border-border/20 bg-muted/10 opacity-50" : "border-border/30 bg-muted/15"}`}>
                  <span className="text-[8px] text-muted-foreground absolute top-0.5 left-1">D{entry.day}</span>
                  <span className="text-base leading-none mt-1">{rewardIcon(entry.rewards)}</span>
                  <span className="text-[7px] text-muted-foreground leading-tight mt-0.5 line-clamp-2">{rewardLabel(entry.rewards)}</span>
                  {claimed && <Check className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-green-400" />}
                  {isToday && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 animate-ping" />}
                </div>
              );
            })}
          </div>

          <div className="text-center mb-3">
            <p className="text-xs text-muted-foreground">Next reward in {hh}:{mm}:{ss}</p>
          </div>

          <button onClick={claim} disabled={!claimable || claiming}
            className="w-full painted-btn text-sm py-2.5 rounded-lg disabled:opacity-40 flex items-center justify-center gap-2">
            <Gift className="w-4 h-4" />
            {claimable ? `CLAIM DAY ${currentDay}` : "CLAIMED TODAY"}
          </button>
          <p className="text-[10px] text-muted-foreground text-center mt-2">Missing a day doesn't reset your streak — continue from the next reward.</p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
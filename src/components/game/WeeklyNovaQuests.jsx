import React, { useState } from "react";
import { motion } from "framer-motion";
import { Gem, Check, Gift } from "lucide-react";
import {
  weeklyNovaQuestStatus,
  claimWeeklyNovaQuest,
  weeklyNovaSecondsLeft,
} from "@/lib/weeklyNovaQuests";
import { useToast } from "@/components/ui/use-toast";

function fmtLeft(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function WeeklyNovaQuests({ character, onClaimed }) {
  const [busyId, setBusyId] = useState(null);
  const { toast } = useToast();
  if (!character) return null;

  const quests = weeklyNovaQuestStatus(character);
  const left = weeklyNovaSecondsLeft();
  const totalReward = quests.reduce((s, q) => s + q.reward, 0);

  async function claim(questId) {
    if (busyId) return;
    setBusyId(questId);
    try {
      const { character: updated, quest } = await claimWeeklyNovaQuest(character, questId);
      onClaimed?.(updated);
      toast({
        title: `+${quest.reward} Nova Crystals`,
        description: `${quest.label} claimed for the week.`,
      });
    } catch (e) {
      toast({ title: "Could not claim", description: e.message || "Try again.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 painted-panel painted-frame canvas-grain">
      <div className="absolute inset-0 pointer-events-none opacity-70" style={{
        background: "radial-gradient(ellipse 70% 50% at 0% 0%, rgba(251,191,36,0.12), transparent 55%)",
      }} />
      <div className="relative p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display font-bold text-sm tracking-wider flex items-center gap-2 text-amber-300">
              <Gift className="w-4 h-4" /> Weekly Nova Ops
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Play to earn up to {totalReward} 💎 this week · resets in {fmtLeft(left)}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {quests.map((q) => {
            const pct = Math.min(100, Math.round((q.progress / q.goal) * 100));
            return (
              <motion.div
                key={q.id}
                layout
                className="rounded-xl border border-border/50 bg-background/35 px-3 py-2.5 flex items-center gap-3"
              >
                <span className="text-lg shrink-0">{q.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-display font-bold text-xs truncate">{q.label}</p>
                    <span className="text-[10px] text-amber-300 font-display font-bold shrink-0">+{q.reward} 💎</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{q.desc}</p>
                  <div className="mt-1.5 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-400/80 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-0.5 font-display">
                    {Math.min(q.progress, q.goal)} / {q.goal}
                  </p>
                </div>
                {q.claimed ? (
                  <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-display font-bold text-emerald-400 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                    <Check className="w-3 h-3" /> Done
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={!q.claimable || busyId === q.id}
                    onClick={() => claim(q.id)}
                    className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-display font-black tracking-wider border border-amber-400/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 disabled:opacity-35 disabled:cursor-not-allowed"
                  >
                    <Gem className="w-3 h-3" />
                    {q.claimable ? "Claim" : "Locked"}
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

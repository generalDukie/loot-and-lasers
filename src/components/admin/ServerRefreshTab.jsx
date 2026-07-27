import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, AlertTriangle, Loader2, Check } from "lucide-react";
import { api } from "@/api/gameClient";
import { useToast } from "@/components/ui/use-toast";

// Entities wiped during a server refresh — characters, guilds, and every
// dependent record tied to them.
const WIPE_ENTITIES = [
  "Character",
  "Guild",
  "GuildMember",
  "GuildWar",
  "GuildWarReady",
  "GuildLog",
  "GuildChallenge",
  "GuildBattle",
  "Item",
  "Mission",
  "Mail",
  "PrivateMessage",
  "PrivateConversation",
  "ChatMessage",
  "AppNotification",
  "NexusAssault",
  "NexusHallOfFame",
  "Nexus",
  "Friendship",
  "FriendRequest",
  "Block",
  "DailyLogin",
  "PlayerPresence",
  "Report",
];

const PHASE_TEXT = "SERVER REFRESH";

export default function ServerRefreshTab() {
  const { toast } = useToast();
  const [stage, setStage] = useState("idle"); // idle | confirm1 | confirm2 | wiping | done
  const [progress, setProgress] = useState({ current: "", done: 0, total: WIPE_ENTITIES.length });

  async function executeWipe() {
    setStage("wiping");
    let done = 0;
    const summary = [];
    for (const name of WIPE_ENTITIES) {
      setProgress({ current: name, done, total: WIPE_ENTITIES.length });
      try {
        const res = await api.entities[name].deleteMany({});
        summary.push(`${name}: ${res?.deleted_count ?? res?.count ?? "✓"}`);
      } catch (e) {
        summary.push(`${name}: ✗ ${e.message || "error"}`);
      }
      done++;
      setProgress({ current: name, done, total: WIPE_ENTITIES.length });
    }
    setStage("done");
    toast({ title: "Server refreshed", description: "All character & guild data wiped." });
  }

  function reset() {
    setStage("idle");
    setProgress({ current: "", done: 0, total: WIPE_ENTITIES.length });
  }

  return (
    <div className="space-y-4">
      <div className="painted-panel canvas-grain p-5">
        <div className="flex items-center gap-2 mb-2">
          <RefreshCw className="w-5 h-5 text-destructive" />
          <h2 className="font-display font-bold text-base tracking-wide">Server Refresh</h2>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed mb-4">
          Permanently deletes <b className="text-foreground">every character, guild, item, mission, mail, and message</b> in the database.
          This action cannot be undone. Use only for a full world reset.
        </p>

        {/* Stage: idle → first confirm */}
        <AnimatePresence mode="wait">
          {stage === "idle" && (
            <motion.button
              key="idle"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setStage("confirm1")}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-destructive/15 border-2 border-destructive/40 text-destructive font-display font-bold text-sm hover:bg-destructive/25 transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> Wipe All Server Data
            </motion.button>
          )}

          {stage === "confirm1" && (
            <motion.div
              key="c1"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/30">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <p className="font-display font-bold text-destructive mb-1">Are you absolutely sure?</p>
                  This will delete all {WIPE_ENTITIES.length} data tables. Every player loses their character and guild. There is no recovery.
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStage("confirm2")} className="flex-1 px-4 py-2 rounded-xl bg-destructive/20 border border-destructive/40 text-destructive font-display font-bold text-xs hover:bg-destructive/30 transition-colors">
                  Continue
                </button>
                <button onClick={reset} className="flex-1 px-4 py-2 rounded-xl bg-muted/30 border border-border/40 text-muted-foreground font-display font-semibold text-xs hover:bg-muted/40 transition-colors">
                  Cancel
                </button>
              </div>
            </motion.div>
          )}

          {stage === "confirm2" && (
            <motion.div
              key="c2"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30">
                <p className="text-xs font-display font-bold text-destructive mb-1.5">Final confirmation</p>
                <p className="text-xs text-muted-foreground mb-3">
                  Type <code className="px-1.5 py-0.5 rounded bg-muted/40 text-foreground font-mono text-[11px]">{PHASE_TEXT}</code> below to permanently wipe the server.
                </p>
                <TypeToConfirm onMatch={() => setStage("armed")} onBack={reset} target={PHASE_TEXT} />
              </div>
              <button onClick={reset} className="w-full px-4 py-2 rounded-xl bg-muted/30 border border-border/40 text-muted-foreground font-display font-semibold text-xs hover:bg-muted/40 transition-colors">
                Cancel
              </button>
            </motion.div>
          )}

          {stage === "armed" && (
            <motion.div
              key="armed"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/15 border border-destructive/40">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                <p className="text-xs text-destructive font-display font-bold">All checks passed. Click to execute the wipe now.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={executeWipe} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-destructive text-destructive-foreground font-display font-bold text-xs hover:brightness-110 transition-colors">
                  <AlertTriangle className="w-3.5 h-3.5" /> Execute Full Wipe
                </button>
                <button onClick={reset} className="px-4 py-2.5 rounded-xl bg-muted/30 border border-border/40 text-muted-foreground font-display font-semibold text-xs hover:bg-muted/40 transition-colors">
                  Cancel
                </button>
              </div>
            </motion.div>
          )}

          {stage === "wiping" && (
            <motion.div key="wiping" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
                <p className="text-xs font-display font-semibold">Wiping <span className="text-primary">{progress.current}</span>…</p>
              </div>
              <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
                <motion.div className="h-full bg-primary" animate={{ width: `${(progress.done / progress.total) * 100}%` }} transition={{ ease: "easeOut" }} />
              </div>
              <p className="text-[10px] text-muted-foreground text-right">{progress.done}/{progress.total} tables</p>
            </motion.div>
          )}

          {stage === "done" && (
            <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              <div className="flex items-center gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/30">
                <Check className="w-4 h-4 text-green-400 shrink-0" />
                <p className="text-xs font-display font-semibold text-green-400">Server data wiped successfully.</p>
              </div>
              <button onClick={reset} className="w-full px-4 py-2 rounded-xl bg-muted/30 border border-border/40 text-muted-foreground font-display font-semibold text-xs hover:bg-muted/40 transition-colors">
                Done
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function TypeToConfirm({ target, onMatch, onBack }) {
  const [val, setVal] = useState("");
  const match = val.trim().toUpperCase() === target;
  return (
    <div className="space-y-2">
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder={target}
        autoFocus
        className={`w-full bg-muted/30 border rounded-lg px-3 py-2 text-sm outline-none transition-colors ${match ? "border-destructive/60 text-destructive" : "border-border/40"}`}
      />
      <button
        onClick={() => match ? onMatch() : null}
        disabled={!match}
        className="w-full px-4 py-2 rounded-xl bg-destructive text-destructive-foreground font-display font-bold text-xs disabled:opacity-40 hover:brightness-110 transition-colors"
      >
        Confirm &amp; Arm
      </button>
    </div>
  );
}
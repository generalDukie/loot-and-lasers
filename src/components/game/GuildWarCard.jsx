import React from "react";
import { Clock, Check, Swords, ChevronRight } from "lucide-react";
import { isWarReadyExpired } from "@/lib/guildEngine";

function timeLeft(deadline) {
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return "Ready to battle!";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m left`;
}

export default function GuildWarCard({ war, readies, character, membership, busy, onToggleReady, onResolve, onReplay }) {
  const isAttacker = war.attacker_guild_id === membership?.guild_id;
  const myReadied = readies.some((r) => r.character_id === character.id);
  const expired = isWarReadyExpired(war);
  const atkReady = readies.filter((r) => r.side === "attacker").length;
  const defReady = readies.filter((r) => r.side === "defender").length;
  const completed = war.status === "completed";
  const won = completed && war.winner_side === (isAttacker ? "attacker" : "defender");

  return (
    <div className="rounded-xl border border-border/50 bg-card/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 text-center min-w-0">
          <p className="font-display font-bold text-xs truncate" style={{ color: isAttacker ? "#2DD4BF" : undefined }}>
            {war.attacker_guild_name}
          </p>
          <p className="text-[9px] text-muted-foreground">{isAttacker ? "Your guild" : "Attacker"}</p>
        </div>
        <span className="font-display font-bold text-xs text-muted-foreground">VS</span>
        <div className="flex-1 text-center min-w-0">
          <p className="font-display font-bold text-xs truncate" style={{ color: !isAttacker ? "#2DD4BF" : undefined }}>
            {war.defender_guild_name}
          </p>
          <p className="text-[9px] text-muted-foreground">{!isAttacker ? "Your guild" : "Defender"}</p>
        </div>
      </div>

      {!completed ? (
        <>
          <div className="flex items-center justify-center gap-3 mt-2 text-[10px]">
            <span className="text-primary font-display font-bold">{atkReady} ready</span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="w-3 h-3" />
              {timeLeft(war.ready_deadline)}
            </span>
            <span className="text-destructive font-display font-bold">{defReady} ready</span>
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={onToggleReady}
              disabled={busy}
              className={`flex-1 text-[11px] px-3 py-1.5 rounded-lg font-display font-semibold flex items-center justify-center gap-1 transition-colors ${
                myReadied
                  ? "bg-green-500/15 text-green-400 border border-green-500/30"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
              }`}
            >
              <Check className="w-3 h-3" />
              {myReadied ? "Readied" : "Ready Up"}
            </button>
            {expired && (
              <button
                onClick={onResolve}
                disabled={busy}
                className="flex-1 text-[11px] px-3 py-1.5 rounded-lg font-display font-bold painted-btn flex items-center justify-center gap-1"
              >
                {busy ? (
                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Swords className="w-3 h-3" />
                )}
                Begin Battle
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
            <span
              className={`text-[11px] font-display font-bold px-3 py-0.5 rounded-full ${
                won ? "bg-green-500/15 text-green-400" : "bg-destructive/15 text-destructive"
              }`}
            >
              {won ? "VICTORY" : "DEFEAT"}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {war.attacker_ready_count}v{war.defender_ready_count}
            </span>
            <span className="text-[10px] text-accent">{war.reward_stardust} ✨</span>
          </div>
          <button
            onClick={onReplay}
            className="w-full mt-2 text-[11px] px-3 py-1.5 rounded-lg font-display font-semibold bg-muted/40 hover:bg-muted/60 text-muted-foreground flex items-center justify-center gap-1"
          >
            View Battle Log <ChevronRight className="w-3 h-3" />
          </button>
        </>
      )}
    </div>
  );
}
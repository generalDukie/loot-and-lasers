import React from "react";
import { motion } from "framer-motion";
import { Gift, AlertTriangle, Check } from "lucide-react";
import { formatMailTime, mailPreview, isMailPriority } from "@/lib/mailUi";

function senderInitial(mail) {
  const n = String(mail?.from_name || "?").trim();
  return (n[0] || "?").toUpperCase();
}

function typeTint(mail) {
  const type = String(mail?.mail_type || "player").toLowerCase();
  if (mail?.has_rewards && !mail?.claimed) return { border: "hsl(40 80% 50% / 0.45)", avatar: "hsl(40 70% 40% / 0.35)", text: "hsl(40 90% 70%)" };
  if (type.includes("guild")) return { border: "hsl(280 50% 55% / 0.4)", avatar: "hsl(280 40% 30% / 0.4)", text: "hsl(280 80% 75%)" };
  if (type === "system" || type === "admin") return { border: "hsl(270 50% 55% / 0.4)", avatar: "hsl(270 35% 28% / 0.4)", text: "hsl(270 80% 78%)" };
  return { border: "hsl(190 50% 45% / 0.35)", avatar: "hsl(190 40% 28% / 0.35)", text: "hsl(190 80% 70%)" };
}

/**
 * Single transmission card in the inbox list.
 */
export default function MailListItem({ mail, selected, onOpen, index = 0 }) {
  const unread = !mail.read && mail.folder !== "deleted";
  const priority = isMailPriority(mail);
  const tint = typeTint(mail);
  const claimed = !!mail.claimed;
  const hasReward = !!mail.has_rewards;

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22, delay: Math.min(index * 0.03, 0.24) }}
      onClick={() => onOpen?.(mail)}
      className={`mail-list-item group w-full text-left rounded-2xl border p-3 transition-all duration-200 ${
        selected
          ? "border-cyan-400/45"
          : unread
            ? "border-cyan-500/25 hover:border-cyan-400/40"
            : "border-border/25 hover:border-border/45"
      }`}
      style={{
        background: selected
          ? "linear-gradient(135deg, hsl(190 50% 30% / 0.22), hsl(222 24% 12% / 0.9))"
          : unread
            ? "linear-gradient(135deg, hsl(190 40% 20% / 0.18), hsl(222 22% 10% / 0.85))"
            : "linear-gradient(135deg, hsl(222 20% 12% / 0.65), hsl(230 22% 8% / 0.8))",
        boxShadow: selected
          ? "0 0 20px hsl(190 90% 50% / 0.15), inset 3px 0 0 hsl(190 90% 55%)"
          : unread
            ? "inset 3px 0 0 hsl(190 90% 50% / 0.7)"
            : undefined,
      }}
    >
      <div className="flex gap-3">
        <div className="relative shrink-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-display font-bold border"
            style={{
              borderColor: tint.border,
              background: tint.avatar,
              color: tint.text,
              boxShadow: unread ? `0 0 12px ${tint.border}` : undefined,
            }}
          >
            {senderInitial(mail)}
          </div>
          {unread && (
            <span className="mail-unread-pulse absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-cyan-400 border-2 border-[hsl(230_30%_8%)]" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <p
              className={`text-[13px] font-display truncate flex-1 ${
                unread ? "font-bold text-foreground" : "font-semibold text-foreground/75"
              }`}
            >
              {mail.subject || "(no subject)"}
            </p>
            <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
              {formatMailTime(mail.created_date)}
            </span>
          </div>

          <p className="text-[11px] text-muted-foreground truncate mb-1">
            <span className="text-foreground/55">{mail.from_name || "Unknown"}</span>
            {" · "}
            {mailPreview(mail, 56)}
          </p>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="text-[9px] font-display uppercase tracking-wider px-1.5 py-0.5 rounded-md border"
              style={{
                color: tint.text,
                borderColor: tint.border,
                background: "hsl(0 0% 0% / 0.2)",
              }}
            >
              {String(mail.mail_type || "player").replace(/_/g, " ")}
            </span>
            {priority && !claimed && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-display uppercase tracking-wider px-1.5 py-0.5 rounded-md border border-rose-400/30 text-rose-200/90 bg-rose-500/10">
                <AlertTriangle className="w-2.5 h-2.5" />
                Priority
              </span>
            )}
            {hasReward && !claimed && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-display uppercase tracking-wider px-1.5 py-0.5 rounded-md border border-amber-400/40 text-amber-200 bg-amber-500/15">
                <Gift className="w-2.5 h-2.5" />
                Package
              </span>
            )}
            {claimed && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-display uppercase tracking-wider px-1.5 py-0.5 rounded-md border border-emerald-400/35 text-emerald-300/90 bg-emerald-500/10">
                <Check className="w-2.5 h-2.5" />
                Claimed
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.button>
  );
}

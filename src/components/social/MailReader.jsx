import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Trash2,
  Undo2,
  Reply,
  UserPlus,
  UserCheck,
  X,
  MailOpen,
} from "lucide-react";
import MailRewardPanel from "@/components/social/MailRewardPanel";
import { formatMailTime } from "@/lib/mailUi";

function typeBadge(mail) {
  const type = String(mail?.mail_type || "player").toLowerCase();
  if (type.includes("guild")) return { label: type.replace(/_/g, " "), cls: "bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-400/30" };
  if (type === "system" || type === "admin") return { label: type, cls: "bg-violet-500/15 text-violet-200 border-violet-400/30" };
  return { label: type.replace(/_/g, " "), cls: "bg-cyan-500/15 text-cyan-200 border-cyan-400/30" };
}

/**
 * Immersive transmission reader pane.
 */
export default function MailReader({
  mail,
  onBack,
  onClaim,
  onDelete,
  onRestore,
  onUnread,
  onReply,
  onAcceptInvite,
  onDeclineInvite,
  onAcceptRequest,
  onDeclineRequest,
}) {
  const [claiming, setClaiming] = useState(false);
  if (!mail) return null;

  const badge = typeBadge(mail);
  const initial = String(mail.from_name || "?")[0]?.toUpperCase() || "?";

  async function claim() {
    setClaiming(true);
    try {
      await onClaim?.(mail);
    } finally {
      setClaiming(false);
    }
  }

  return (
    <motion.div
      key={mail.id}
      initial={{ opacity: 0, y: 12, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col h-full min-h-0"
    >
      {/* Header */}
      <div
        className="shrink-0 px-4 py-3.5 border-b flex items-start gap-3"
        style={{
          borderColor: "hsl(190 30% 40% / 0.22)",
          background: "linear-gradient(90deg, hsl(190 50% 35% / 0.1), transparent 70%)",
        }}
      >
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="sm:hidden p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5"
            aria-label="Back to list"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-display font-bold border shrink-0"
          style={{
            borderColor: "hsl(190 50% 45% / 0.4)",
            background: "hsl(190 40% 25% / 0.35)",
            color: "hsl(190 80% 75%)",
          }}
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2 flex-wrap">
            <h2 className="font-display font-bold text-base sm:text-lg tracking-wide text-foreground/95 flex-1 min-w-0">
              {mail.subject || "(no subject)"}
            </h2>
            <span className={`text-[9px] font-display uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${badge.cls}`}>
              {badge.label}
            </span>
          </div>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            From <span className="text-foreground/80 font-display">{mail.from_name}</span>
            {" · "}
            <span title={mail.created_date}>
              {formatMailTime(mail.created_date)}
              {mail.created_date ? ` · ${new Date(mail.created_date).toLocaleString()}` : ""}
            </span>
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="mail-scroll flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
        <div
          className="rounded-2xl border p-4 text-sm leading-relaxed text-foreground/85 whitespace-pre-wrap"
          style={{
            borderColor: "hsl(210 18% 28% / 0.45)",
            background: "hsl(230 25% 9% / 0.55)",
          }}
        >
          {mail.body || (
            <span className="italic text-muted-foreground">This transmission has no body.</span>
          )}
        </div>

        {mail.has_rewards && (
          <MailRewardPanel mail={mail} onClaim={claim} claiming={claiming} />
        )}

        {mail.mail_type === "guild_invite" && mail.guild_id && mail.folder !== "deleted" && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onAcceptInvite} className="inline-flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-xl painted-btn">
              <UserPlus className="w-3.5 h-3.5" /> Accept Invite
            </button>
            <button
              type="button"
              onClick={onDeclineInvite}
              className="inline-flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive"
            >
              <X className="w-3.5 h-3.5" /> Decline
            </button>
          </div>
        )}

        {mail.mail_type === "guild_request" && mail.guild_id && mail.folder !== "deleted" && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onAcceptRequest} className="inline-flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-xl painted-btn">
              <UserCheck className="w-3.5 h-3.5" /> Accept Request
            </button>
            <button
              type="button"
              onClick={onDeclineRequest}
              className="inline-flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive"
            >
              <X className="w-3.5 h-3.5" /> Decline
            </button>
          </div>
        )}
      </div>

      {/* Actions */}
      <div
        className="shrink-0 px-4 py-3 border-t flex flex-wrap gap-2"
        style={{
          borderColor: "hsl(190 30% 40% / 0.2)",
          background: "hsl(230 28% 8% / 0.65)",
        }}
      >
        {mail.folder === "deleted" ? (
          <button
            type="button"
            onClick={onRestore}
            className="inline-flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-xl border border-border/40 bg-muted/25 hover:bg-muted/40 transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" /> Restore
          </button>
        ) : (
          <>
            {mail.mail_type === "player" && mail.from_id !== "system" && (
              <button
                type="button"
                onClick={onReply}
                className="inline-flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-xl border border-border/40 bg-muted/25 hover:bg-muted/40 transition-colors"
              >
                <Reply className="w-3.5 h-3.5" /> Reply
              </button>
            )}
            <button
              type="button"
              onClick={onUnread}
              className="inline-flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-xl border border-border/40 bg-muted/25 hover:bg-muted/40 transition-colors"
            >
              <MailOpen className="w-3.5 h-3.5" /> Mark Unread
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/15 transition-colors ml-auto"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
}

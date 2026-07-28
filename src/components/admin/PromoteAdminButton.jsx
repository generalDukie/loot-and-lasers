import React, { useEffect, useState } from "react";
import { api } from "@/api/gameClient";
import { ShieldCheck, ShieldOff } from "lucide-react";

/**
 * Admin is an account (login) permission — not per-character.
 * Promoting here sets users.role for the account that owns this character;
 * every operative on that login shares the same admin access.
 */
export default function PromoteAdminButton({ character, onAction }) {
  const [owner, setOwner] = useState(null);
  const [meId, setMeId] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setOwner(null);
    if (!character?.created_by_id) return;
    let cancelled = false;
    (async () => {
      try {
        const [u, me] = await Promise.all([
          api.entities.User.get(character.created_by_id),
          api.auth.me().catch(() => null),
        ]);
        if (!cancelled) {
          setOwner(u);
          setMeId(me?.id || null);
        }
      } catch {
        if (!cancelled) setOwner(null);
      }
    })();
    return () => { cancelled = true; };
  }, [character?.id, character?.created_by_id]);

  const isOwnerAdmin = owner?.role === "admin";
  const isSelfAccount = !!(meId && character?.created_by_id && meId === character.created_by_id);

  async function toggle() {
    if (!character?.created_by_id || isSelfAccount) return;
    const next = isOwnerAdmin ? "user" : "admin";
    setBusy(true);
    await onAction({
      action: "set_role",
      user_id: character.created_by_id,
      character_id: character.id,
      role: next,
    });
    try {
      const u = await api.entities.User.get(character.created_by_id);
      setOwner(u);
    } catch { /* ignore */ }
    setBusy(false);
  }

  return (
    <div className="space-y-1.5 p-2 rounded-xl bg-muted/15 border border-border/20">
      <div className="flex items-center gap-2">
        <ShieldCheck className={`w-4 h-4 shrink-0 ${isOwnerAdmin ? "text-primary" : "text-muted-foreground"}`} />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">
            Account role:{" "}
            <span className={isOwnerAdmin ? "text-primary font-semibold" : "text-foreground"}>
              {owner?.role || "…"}
            </span>
          </p>
          {owner?.email && (
            <p className="text-[10px] text-muted-foreground/80 truncate" title={owner.email}>
              {owner.email}
            </p>
          )}
        </div>
        <button
          onClick={toggle}
          disabled={busy || !owner || isSelfAccount}
          title={
            isSelfAccount
              ? "You cannot change your own account role"
              : isOwnerAdmin
                ? "Remove admin from this account (all characters)"
                : "Grant admin to this account (all characters)"
          }
          className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-50 ${
            isOwnerAdmin
              ? "bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/25"
              : "bg-primary/15 text-primary border-primary/30 hover:bg-primary/25"
          }`}
        >
          {isOwnerAdmin ? <ShieldOff className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
          {busy ? "…" : isOwnerAdmin ? "Demote account" : "Promote account"}
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground/70 leading-snug pl-6">
        Admin is for the login, not the operative. Every character on this account shares the same access.
      </p>
    </div>
  );
}

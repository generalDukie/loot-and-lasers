import React, { useEffect, useState } from "react";
import { api } from "@/api/gameClient";
import { useToast } from "@/components/ui/use-toast";
import { ShieldCheck, ShieldOff } from "lucide-react";

export default function PromoteAdminButton({ character, onAction }) {
  const { toast } = useToast();
  const [owner, setOwner] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setOwner(null);
    if (!character?.created_by_id) return;
    api.entities.User.get(character.created_by_id)
      .then(setOwner)
      .catch(() => setOwner(null));
  }, [character?.id, character?.created_by_id]);

  const isSelf = owner && character.created_by_id === owner.id && false; // guard placeholder
  const isOwnerAdmin = owner?.role === "admin";

  async function toggle() {
    if (!character?.created_by_id) return;
    const next = isOwnerAdmin ? "user" : "admin";
    setBusy(true);
    await onAction({ action: "set_role", character_id: character.id, role: next });
    try {
      const u = await api.entities.User.get(character.created_by_id);
      setOwner(u);
    } catch {}
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-2 p-2 rounded-xl bg-muted/15 border border-border/20">
      <ShieldCheck className={`w-4 h-4 ${isOwnerAdmin ? "text-primary" : "text-muted-foreground"}`} />
      <span className="text-xs text-muted-foreground flex-1">
        Account role: <span className={isOwnerAdmin ? "text-primary font-semibold" : "text-foreground"}>{owner?.role || "…"}</span>
      </span>
      <button
        onClick={toggle}
        disabled={busy || !owner}
        className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-50 ${
          isOwnerAdmin
            ? "bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/25"
            : "bg-primary/15 text-primary border-primary/30 hover:bg-primary/25"
        }`}
      >
        {isOwnerAdmin ? <ShieldOff className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
        {busy ? "…" : isOwnerAdmin ? "Demote" : "Promote to Admin"}
      </button>
    </div>
  );
}
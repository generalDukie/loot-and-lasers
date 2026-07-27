import React, { useState, useEffect } from "react";
import { api } from "@/api/gameClient";
import { trackNovaSpend } from "@/lib/novaTracker";
import { Loader2, Mail, Lock, Pencil, Gem } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { getMyCharacter } from "@/lib/socialEngine";

const NAME_CHANGE_COST = 500;

export default function ProfileSettings() {
  const [char, setChar] = useState(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([
      getMyCharacter(),
      api.auth.me().catch(() => null),
    ]).then(([myChar, user]) => {
      if (myChar) { setChar(myChar); setName(myChar.name || ""); }
      if (user) setEmail(user.email || "");
    }).finally(() => setLoading(false));
  }, []);

  async function handleRename(e) {
    e.preventDefault();
    if (!char) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === char.name) return;
    if ((char.nova_crystals || 0) < NAME_CHANGE_COST) {
      toast({ title: "Not enough Nova Crystals", description: `Renaming costs ${NAME_CHANGE_COST} 💎 — you have ${char.nova_crystals || 0}.`, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await api.entities.Character.update(char.id, {
        name: trimmed,
        nova_crystals: (char.nova_crystals || 0) - NAME_CHANGE_COST,
      });
      setChar(c => ({ ...c, name: trimmed, nova_crystals: (c.nova_crystals || 0) - NAME_CHANGE_COST }));
      void trackNovaSpend(char, NAME_CHANGE_COST, "rename");
      toast({ title: "✏️ Operative renamed", description: `-${NAME_CHANGE_COST} 💎 — new identity: ${trimmed}` });
    } catch (err) {
      toast({ title: "Rename failed", description: err.message || "Try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="painted-panel canvas-grain p-4 space-y-4">
      {/* Linked email (locked) */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <Mail className="w-4 h-4 text-accent" />
          <h2 className="font-display font-semibold text-sm">Linked Email</h2>
        </div>
        {loading ? (
          <div className="h-10 flex items-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="flex items-center gap-2 px-3 h-10 bg-muted/40 rounded-lg border border-border/50">
            <span className="text-sm text-muted-foreground truncate flex-1">{email || "—"}</span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70 shrink-0">
              <Lock className="w-3 h-3" /> Locked
            </span>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground/60 mt-1">Email is tied to your account and can't be changed.</p>
      </div>

      {/* Change operative name */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <Pencil className="w-4 h-4 text-primary" />
          <h2 className="font-display font-semibold text-sm">Change Operative Name</h2>
        </div>
        {loading || !char ? (
          <div className="h-10 flex items-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
        ) : (
          <form onSubmit={handleRename} className="space-y-2">
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="New operative name" className="h-10" maxLength={24} disabled={saving} />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Gem className="w-3 h-3 text-amber-400" /> Cost: {NAME_CHANGE_COST} · Balance: {char.nova_crystals || 0}
              </span>
              <button type="submit" disabled={saving || !name.trim() || name.trim() === char.name} className="painted-btn px-4 py-2 text-xs flex items-center gap-1.5 disabled:opacity-50">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pencil className="w-3.5 h-3.5" />}
                Rename
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
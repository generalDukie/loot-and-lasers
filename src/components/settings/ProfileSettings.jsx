import React, { useState, useEffect } from "react";
import { api } from "@/api/gameClient";
import { trackNovaSpend } from "@/lib/novaTracker";
import { Loader2, Mail, Lock, Pencil, Gem, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { getMyCharacter, bustMyCharacterCache } from "@/lib/socialEngine";
import { useAuth } from "@/lib/AuthContext";
import {
  LEGACY_DISPLAY_SURNAME,
  LEGACY_DISPLAY_FAMILY,
  normalizeLegacyDisplay,
  profileDisplayName,
  familyLabel,
} from "@/lib/legacyName";

const NAME_CHANGE_COST = 500;

export default function ProfileSettings() {
  const [char, setChar] = useState(null);
  const [email, setEmail] = useState("");
  const [legacyName, setLegacyName] = useState("");
  const [legacyDisplay, setLegacyDisplay] = useState(LEGACY_DISPLAY_SURNAME);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingDisplay, setSavingDisplay] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { checkUserAuth } = useAuth();

  useEffect(() => {
    Promise.all([
      getMyCharacter(),
      api.auth.me().catch(() => null),
    ]).then(([myChar, user]) => {
      if (myChar) { setChar(myChar); setName(myChar.name || ""); }
      if (user) {
        setEmail(user.email || "");
        setLegacyName(user.legacy_name || myChar?.legacy_name || "");
        setLegacyDisplay(normalizeLegacyDisplay(user.legacy_display || myChar?.legacy_display));
      }
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

  async function handleLegacyDisplay(mode) {
    const next = normalizeLegacyDisplay(mode);
    if (next === legacyDisplay) return;
    setSavingDisplay(true);
    try {
      await api.auth.updateMe({ legacy_display: next });
      // Stamp onto every operative so public profiles honor the preference.
      const uid = (await api.auth.me()).id;
      const roster = await api.entities.Character.filter({ created_by_id: uid }, "-created_date", 50);
      await Promise.all(
        (roster || []).map((c) =>
          api.entities.Character.update(c.id, { legacy_display: next }).catch(() => null)
        )
      );
      setLegacyDisplay(next);
      setChar((c) => (c ? { ...c, legacy_display: next } : c));
      bustMyCharacterCache();
      await checkUserAuth?.();
      toast({
        title: "Profile name style updated",
        description: next === LEGACY_DISPLAY_FAMILY
          ? `Profiles show ${familyLabel(legacyName) || "the family"}`
          : "Profiles show your operative name + surname",
      });
    } catch (err) {
      toast({ title: "Could not save", description: err.message || "Try again.", variant: "destructive" });
    } finally {
      setSavingDisplay(false);
    }
  }

  const previewChar = {
    name: name || char?.name || "Operative",
    legacy_name: legacyName,
    legacy_display: legacyDisplay,
  };

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

      {/* Legacy display style */}
      {legacyName && (
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Users className="w-4 h-4 text-primary" />
            <h2 className="font-display font-semibold text-sm">Legacy on Profile</h2>
          </div>
          <p className="text-[10px] text-muted-foreground mb-2">
            Locked surname: <span className="text-foreground font-semibold">{legacyName}</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={savingDisplay}
              onClick={() => handleLegacyDisplay(LEGACY_DISPLAY_SURNAME)}
              className={`text-left p-3 rounded-xl border transition-colors ${
                legacyDisplay === LEGACY_DISPLAY_SURNAME
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/50 hover:bg-muted/30 text-muted-foreground"
              }`}
            >
              <p className="text-xs font-display font-semibold">As surname</p>
              <p className="text-[10px] mt-1 opacity-80">First + {legacyName}</p>
            </button>
            <button
              type="button"
              disabled={savingDisplay}
              onClick={() => handleLegacyDisplay(LEGACY_DISPLAY_FAMILY)}
              className={`text-left p-3 rounded-xl border transition-colors ${
                legacyDisplay === LEGACY_DISPLAY_FAMILY
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/50 hover:bg-muted/30 text-muted-foreground"
              }`}
            >
              <p className="text-xs font-display font-semibold">Family only</p>
              <p className="text-[10px] mt-1 opacity-80">{familyLabel(legacyName)}</p>
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Profile preview: <span className="text-foreground font-display font-semibold">{profileDisplayName(previewChar)}</span>
            {savingDisplay && <Loader2 className="w-3 h-3 inline ml-1 animate-spin" />}
          </p>
        </div>
      )}

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

import React, { useEffect, useState } from "react";
import { api } from "@/api/gameClient";
import { trackNovaSpend } from "@/lib/novaTracker";
import { useToast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { Loader2, Mail, Lock, KeyRound, Pencil, Gem, Users } from "lucide-react";
import { getMyCharacter, bustMyCharacterCache } from "@/lib/socialEngine";
import { useAuth } from "@/lib/AuthContext";
import {
  LEGACY_DISPLAY_SURNAME,
  LEGACY_DISPLAY_FAMILY,
  normalizeLegacyDisplay,
  profileDisplayName,
  familyLabel,
} from "@/lib/legacyName";
import { stripDigitsFromName, nameHasDigits, nameHasWhitespace, NAME_NO_DIGITS_MSG, NAME_NO_SPACES_MSG } from "@/lib/nameRules";

const NAME_CHANGE_COST = 500;

export default function AccountSettings() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");

  const [char, setChar] = useState(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const [legacyName, setLegacyName] = useState("");
  const [legacyDisplay, setLegacyDisplay] = useState(LEGACY_DISPLAY_SURNAME);
  const [savingDisplay, setSavingDisplay] = useState(false);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  const { toast } = useToast();
  const { checkUserAuth } = useAuth();

  useEffect(() => {
    let alive = true;
    Promise.all([
      getMyCharacter(),
      api.auth.me().catch(() => null),
    ]).then(([myChar, user]) => {
      if (!alive) return;
      if (myChar) { setChar(myChar); setName(myChar.name || ""); }
      if (user) {
        setEmail(user.email || "");
        setLegacyName(user.legacy_name || myChar?.legacy_name || "");
        setLegacyDisplay(normalizeLegacyDisplay(user.legacy_display || myChar?.legacy_display));
      }
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  async function handleRename(e) {
    e.preventDefault();
    if (!char) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === char.name) return;
    if (trimmed.length < 2) {
      toast({ title: "Name too short", description: "Need at least 2 characters.", variant: "destructive" });
      return;
    }
    if (nameHasDigits(trimmed)) {
      toast({ title: "Invalid name", description: NAME_NO_DIGITS_MSG, variant: "destructive" });
      return;
    }
    if (nameHasWhitespace(trimmed)) {
      toast({ title: "Invalid name", description: NAME_NO_SPACES_MSG, variant: "destructive" });
      return;
    }
    if ((char.nova_crystals || 0) < NAME_CHANGE_COST) {
      toast({ title: "Not enough Nova Crystals", description: `Renaming costs ${NAME_CHANGE_COST} 💎 — you have ${char.nova_crystals || 0}.`, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await api.functions.invoke("RenameCharacter", { name: trimmed });
      const patch = res.patch || res.data?.patch || {};
      setChar((c) => ({ ...c, ...patch }));
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
      // Also stamp via preferences RPC (Restoration 24 whitelist).
      try {
        const { saveAccountPreferences } = await import("@/lib/preferencesEngine");
        await saveAccountPreferences({ legacy_display: next });
      } catch { /* auth.updateMe already applied */ }
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

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    if (!current || !next || !confirm) return;
    if (next.length < 6) {
      toast({ title: "Password too short", description: "Use at least 6 characters.", variant: "destructive" });
      return;
    }
    if (next !== confirm) {
      toast({ title: "Passwords don't match", description: "New password and confirmation differ.", variant: "destructive" });
      return;
    }
    setSavingPw(true);
    try {
      const user = await api.auth.me();
      await api.auth.changePassword({ userId: user.id, currentPassword: current, newPassword: next });
      toast({ title: "🔑 Password updated", description: "Use your new password next time you sign in." });
      setCurrent(""); setNext(""); setConfirm("");
    } catch (err) {
      toast({ title: "Couldn't change password", description: err.message || "Check your current password and try again.", variant: "destructive" });
    } finally {
      setSavingPw(false);
    }
  }

  const previewChar = {
    name: name || char?.name || "Operative",
    legacy_name: legacyName,
    legacy_display: legacyDisplay,
  };

  return (
    <div className="painted-panel canvas-grain p-4 space-y-4">
      <h2 className="font-display font-bold text-base text-center tracking-wide"><span className="scifi-heading">Account</span></h2>

      {/* Linked email (locked) */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <Mail className="w-4 h-4 text-accent" />
          <h3 className="font-display font-semibold text-sm">Linked Email</h3>
        </div>
        {loading ? (
          <div className="h-10 flex items-center">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 h-10 bg-muted/40 rounded-lg border border-border/50">
            <span className="text-sm text-muted-foreground truncate flex-1">{email || "—"}</span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70 shrink-0">
              <Lock className="w-3 h-3" /> Locked
            </span>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground/60 mt-1">
          Email is tied to your account and can't be changed.
        </p>
      </div>

      {/* Change password */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <KeyRound className="w-4 h-4 text-primary" />
          <h3 className="font-display font-semibold text-sm">Change Password</h3>
        </div>
        <form onSubmit={handlePasswordSubmit} className="space-y-2">
          <Input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="Current password"
            className="h-10"
            disabled={savingPw}
          />
          <Input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="New password"
            className="h-10"
            disabled={savingPw}
          />
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm new password"
            className="h-10"
            disabled={savingPw}
          />
          <button
            type="submit"
            disabled={savingPw || !current || !next || !confirm}
            className="painted-btn px-4 py-2 text-xs flex items-center gap-1.5 disabled:opacity-50"
          >
            {savingPw ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
            Update Password
          </button>
        </form>
      </div>

      {/* Legacy display style */}
      {legacyName && (
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Users className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-sm">Legacy on Profile</h3>
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
              <p className="text-[10px] mt-1 opacity-80">
                Shown after your operative name everywhere — HUD, lists, chat.
              </p>
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
              <p className="text-[10px] mt-1 opacity-80">
                Just your first name in HUD and lists; “{familyLabel(legacyName)}” under your hero gear.
              </p>
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Either way, other players still see your family on public profiles — chat, guild, friends and rankings.
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Profile preview: <span className="text-foreground font-display font-semibold">{profileDisplayName(previewChar)}</span>
            {savingDisplay && <Loader2 className="w-3 h-3 inline ml-1 animate-spin" />}
          </p>
        </div>
      )}

      {/* Change operative name */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <Pencil className="w-4 h-4 text-primary" />
          <h3 className="font-display font-semibold text-sm">Change Operative Name</h3>
        </div>
        {loading || !char ? (
          <div className="h-10 flex items-center">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form onSubmit={handleRename} className="space-y-2">
            <Input
              value={name}
              onChange={(e) => setName(stripDigitsFromName(e.target.value))}
              placeholder="New operative name"
              className="h-10"
              maxLength={24}
              disabled={saving}
            />
            <p className="text-[10px] text-muted-foreground/60">Letters only — no numbers.</p>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Gem className="w-3 h-3 text-amber-400" /> Cost: {NAME_CHANGE_COST} · Balance: {char.nova_crystals || 0}
              </span>
              <button
                type="submit"
                disabled={saving || name.trim().length < 2 || name.trim() === char.name}
                className="painted-btn px-4 py-2 text-xs flex items-center gap-1.5 disabled:opacity-50"
              >
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

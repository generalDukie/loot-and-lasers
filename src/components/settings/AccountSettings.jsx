import React, { useEffect, useState } from "react";
import { api } from "@/api/gameClient";
import { useToast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { Loader2, Mail, Lock, KeyRound } from "lucide-react";

export default function AccountSettings() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    let alive = true;
    api.auth
      .me()
      .then((user) => {
        if (!alive) return;
        setEmail(user?.email || "");
      })
      .catch(() => {
        if (!alive) return;
        setEmail("");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!current || !next || !confirm) return;

    if (next.length < 6) {
      toast({
        title: "Password too short",
        description: "Use at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    if (next !== confirm) {
      toast({
        title: "Passwords don't match",
        description: "New password and confirmation differ.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const user = await api.auth.me();
      await api.auth.changePassword({
        userId: user.id,
        currentPassword: current,
        newPassword: next,
      });
      toast({
        title: "🔑 Password updated",
        description: "Use your new password next time you sign in.",
      });
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      toast({
        title: "Couldn't change password",
        description: err.message || "Check your current password and try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="painted-panel canvas-grain p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Mail className="w-4 h-4 text-accent" />
        <h2 className="font-display font-semibold text-sm">Account</h2>
      </div>

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

        <form onSubmit={handleSubmit} className="space-y-2">
          <Input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="Current password"
            className="h-10"
            disabled={saving}
          />
          <Input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="New password"
            className="h-10"
            disabled={saving}
          />
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm new password"
            className="h-10"
            disabled={saving}
          />

          <button
            type="submit"
            disabled={saving || !current || !next || !confirm}
            className="painted-btn px-4 py-2 text-xs flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <KeyRound className="w-3.5 h-3.5" />
            )}
            Update Password
          </button>
        </form>
      </div>
    </div>
  );
}


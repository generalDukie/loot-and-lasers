import React, { useState, useEffect } from "react";
import { api } from "@/api/gameClient";
import { Settings, LogOut, Trash2, Ticket, Loader2, Check, BookOpen } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import CodexModal from "@/components/game/CodexModal";
import AccountSettings from "@/components/settings/AccountSettings";
import AudioSettings from "@/components/settings/AudioSettings";
import { getMyCharacter } from "@/lib/socialEngine";
import { departFromGuild } from "@/lib/guildUtils";
import { purgeCharacter } from "@/lib/purgeCharacter";
import PageStage from "@/components/game/PageStage";

export default function SettingsPage() {
  const [deleting, setDeleting] = useState(false);
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemed, setRedeemed] = useState([]);
  const [codexOpen, setCodexOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    getMyCharacter().then((c) => {
      if (!c) return;
      setRedeemed(c.promo_codes_redeemed || []);
    });
  }, []);

  async function handleRedeem(e) {
    e.preventDefault();
    if (!code.trim()) return;
    setRedeeming(true);
    try {
      const res = await api.functions.invoke("RedeemPromoCode", { code: code.trim() });
      toast({
        title: `🎁 ${res.data.label || "Code redeemed!"}`,
        description: "Rewards applied — reloading your operative.",
      });
      setCode("");
      setTimeout(() => { window.location.href = "/"; }, 1200);
    } catch (err) {
      toast({
        title: "Redemption failed",
        description: err.message || "Invalid or already-used code.",
        variant: "destructive",
      });
    } finally {
      setRedeeming(false);
    }
  }

  async function handleDeleteCharacter() {
    if (!window.confirm("Are you sure? This will permanently delete your character and all items.")) return;
    setDeleting(true);
    const myChar = await getMyCharacter();
    if (myChar) {
      await departFromGuild(myChar.id);
      await purgeCharacter(myChar.id, myChar.name);
      await api.entities.Character.delete(myChar.id);
    }
    toast({ title: "Character deleted", description: "You can create a new operative now." });
    window.location.href = "/";
  }

  async function handleLogout() {
    await api.auth.logout("/login");
  }

  return (
    <PageStage className="space-y-5">
      <h1 className="font-display font-bold text-xl tracking-wider flex items-center gap-2">
        <Settings className="w-5 h-5 text-primary" /> Settings
      </h1>

      <div className="mx-auto w-full max-w-5xl">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,22rem)] gap-4 items-start">
          {/* Left column — Account */}
          <AccountSettings />

          {/* Right column — stacked smaller panels */}
          <div className="flex flex-col gap-4">
            <AudioSettings />

            {/* Codex quick-open */}
            <button
              onClick={() => setCodexOpen(true)}
              className="flex items-center gap-2.5 px-3.5 py-2.5 painted-panel canvas-grain text-left hover:brightness-110 transition rounded-xl w-full"
            >
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <BookOpen className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-display font-semibold text-sm">Codex &amp; Guide</p>
                <p className="text-[11px] text-muted-foreground">How things work · New player tutorial</p>
              </div>
            </button>

            {/* Promo Code */}
            <div className="painted-panel canvas-grain p-3.5 rounded-xl">
              <div className="flex items-center gap-2 mb-2.5">
                <Ticket className="w-4 h-4 text-accent" />
                <h2 className="font-display font-semibold text-sm">Promo Code</h2>
              </div>
              <form onSubmit={handleRedeem} className="flex gap-2">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Enter code"
                  className="h-9"
                  disabled={redeeming}
                />
                <button
                  type="submit"
                  disabled={redeeming || !code.trim()}
                  className="painted-btn painted-btn-accent px-3.5 py-1.5 text-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  {redeeming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ticket className="w-3.5 h-3.5" />}
                  Redeem
                </button>
              </form>
              {redeemed.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {redeemed.map((c) => (
                    <span key={c} className="text-[10px] bg-accent/10 text-accent px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Check className="w-2.5 h-2.5" /> {c}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Danger zone */}
            <div className="rounded-xl border border-border/40 bg-card/30 divide-y divide-border/40">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left hover:bg-muted/20 transition-colors rounded-t-xl"
              >
                <LogOut className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm">Log Out</p>
                  <p className="text-[11px] text-muted-foreground">Sign out of your account</p>
                </div>
              </button>
              <button
                onClick={handleDeleteCharacter}
                disabled={deleting}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left hover:bg-destructive/5 transition-colors text-destructive rounded-b-xl"
              >
                <Trash2 className="w-4 h-4" />
                <div>
                  <p className="font-medium text-sm">Delete Character</p>
                  <p className="text-[11px] opacity-70">Permanently erase your operative and all progress</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      <CodexModal open={codexOpen} onClose={() => setCodexOpen(false)} />
    </PageStage>
  );
}
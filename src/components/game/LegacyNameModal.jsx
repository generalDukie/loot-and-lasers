import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Loader2 } from "lucide-react";
import { api } from "@/api/gameClient";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";

// One-time setup modal: prompts the user for a permanent legacy (sur)name
// that identifies their account across all characters. Once set it cannot
// be changed — the field is locked at the entity level.
export default function LegacyNameModal({ open, onClose }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { checkUserAuth } = useAuth();

  async function handleSubmit(e) {
    e?.preventDefault();
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      toast({ title: "Too short", description: "Legacy name must be at least 2 characters.", variant: "destructive" });
      return;
    }
    if (trimmed.length > 20) {
      toast({ title: "Too long", description: "Legacy name must be 20 characters or fewer.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await api.auth.updateMe({ legacy_name: trimmed });
      await checkUserAuth();
      toast({ title: "Legacy name set", description: `${trimmed} is now your permanent legacy.` });
      onClose?.();
    } catch (err) {
      toast({ title: "Failed", description: err.message || "Try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 26 }}
            className="relative w-full max-w-md painted-panel canvas-grain p-6"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center">
                <Lock className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h2 className="font-display font-bold text-base tracking-wide">Set Your Legacy Name</h2>
                <p className="text-[10px] text-muted-foreground">One-time · permanent</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              This is your account's <b className="text-foreground">surname</b> — a permanent last name shared by
              every character you create. It lets other players recognize all your operatives as the same person.
              <b className="text-destructive"> It can never be changed.</b>
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                value={value}
                onChange={(e) => setValue(e.target.value.slice(0, 20))}
                placeholder="e.g. Voss, Nakamura, Khel…"
                autoFocus
                maxLength={20}
                className="w-full bg-muted/30 border border-border/40 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-primary/50"
              />
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{value.length}/20</span>
                <span>Displayed as: <b className="text-foreground">{value.trim() ? `"${value.trim()}"` : "—"}</b></span>
              </div>
              <button
                type="submit"
                disabled={saving || value.trim().length < 2}
                className="w-full flex items-center justify-center gap-2 painted-btn painted-btn-accent px-4 py-2.5 text-sm disabled:opacity-40"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                Lock In Legacy Name
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
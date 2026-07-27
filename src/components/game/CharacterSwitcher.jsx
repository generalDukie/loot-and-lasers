import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Users, Gem, Check, Loader2, Plus, RefreshCw } from "lucide-react";
import { api } from "@/api/gameClient";
import { trackNovaSpend } from "@/lib/novaTracker";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { getMyCharacters, getMyCharacter, setActiveCharacter, bustMyCharacterCache } from "@/lib/socialEngine";
import CharacterAvatar from "@/components/game/CharacterAvatar";
import { fullName } from "@/lib/legacyName";

export const SLOT_COST = 500; // Nova Crystals per extra slot
export const MAX_SLOTS = 3;  // 1 free + 2 purchased

export default function CharacterSwitcher() {
  const { user, checkUserAuth } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [chars, setChars] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(null);
  const [purchasing, setPurchasing] = useState(false);

  const purchased = user?.purchased_slots || 0;
  const totalSlots = Math.min(MAX_SLOTS, 1 + purchased);
  const canPurchase = totalSlots < MAX_SLOTS;
  const canCreate = chars.length < totalSlots;

  async function load(force = false) {
    setLoading(true);
    try {
      const active = await getMyCharacter({ force });
      setActiveId(active?.id || null);
      const all = await getMyCharacters();
      setChars(all || []);
    } catch (e) {
      // Rate-limited or transient — keep last-known state instead of crashing.
      const msg = e?.message || "";
      if (!/rate limit|429/i.test(msg)) {
        toast({ title: "Couldn't load operatives", description: msg || "Try again.", variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(false); }, []);

  async function handleSwitch(id) {
    if (id === activeId || switching) return;
    setSwitching(id);
    try {
      await setActiveCharacter(id);
      // Hard reload — nearly every page caches character state locally.
      window.location.href = "/";
    } catch (e) {
      toast({ title: "Switch failed", description: e.message || "Try again.", variant: "destructive" });
      setSwitching(null);
    }
  }

  async function handlePurchase() {
    if (purchasing) return;
    const active = chars.find((c) => c.id === activeId) || (await getMyCharacter({ force: true }));
    if (!active) {
      toast({ title: "No active operative", description: "Create your first character before buying a slot.", variant: "destructive" });
      return;
    }
    if ((active.nova_crystals || 0) < SLOT_COST) {
      toast({ title: "Not enough Nova Crystals", description: `You need ${SLOT_COST} 💎 to unlock a new slot.`, variant: "destructive" });
      return;
    }
    setPurchasing(true);
    try {
      await api.entities.Character.update(active.id, { nova_crystals: (active.nova_crystals || 0) - SLOT_COST });
      void trackNovaSpend(active, SLOT_COST, "character_slot");
      await api.auth.updateMe({ purchased_slots: purchased + 1 });
      await checkUserAuth();
      bustMyCharacterCache();
      navigate("/create-character");
    } catch (e) {
      toast({ title: "Purchase failed", description: e.message || "Try again.", variant: "destructive" });
      setPurchasing(false);
    }
  }

  return (
    <div className="painted-panel canvas-grain p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <h2 className="font-display font-semibold text-sm">Operatives</h2>
        </div>
        <button onClick={() => load(true)} className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground mb-3">
        {chars.length}/{totalSlots} slots used · switch active operative anytime.
      </p>

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-2">
          {chars.map((c) => {
            const isActive = c.id === activeId;
            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex items-center gap-3 p-2.5 rounded-xl border transition-colors ${isActive ? "bg-primary/10 border-primary/40" : "bg-muted/15 border-border/20 hover:bg-muted/25"}`}
              >
                <div className="shrink-0">
                  <CharacterAvatar
                    race={c.race}
                    skinColor={c.appearance?.skin_color}
                    eyeStyle={c.appearance?.eye_style}
                    ears={c.appearance?.ears}
                    mouth={c.appearance?.mouth}
                    nose={c.appearance?.nose}
                    eyebrows={c.appearance?.eyebrows}
                    marking={c.appearance?.marking}
                    size={44}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-bold text-sm truncate">{fullName(c)}</p>
                  <p className="text-[10px] text-muted-foreground">Lv{c.level} · {c.race} {c.class}</p>
                </div>
                {isActive ? (
                  <span className="flex items-center gap-1 text-[10px] font-display font-bold text-primary px-2 py-1 rounded-lg bg-primary/10">
                    <Check className="w-3 h-3" /> Active
                  </span>
                ) : (
                  <button
                    onClick={() => handleSwitch(c.id)}
                    disabled={!!switching}
                    className="text-[10px] font-display font-semibold px-2.5 py-1 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-50 transition-colors"
                  >
                    {switching === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Switch"}
                  </button>
                )}
              </motion.div>
            );
          })}

          {chars.length === 0 && (
            <p className="text-xs text-muted-foreground italic text-center py-3">No operatives yet.</p>
          )}
        </div>
      )}

      {/* Create a new operative in an open (free or purchased) slot */}
      {canCreate && (
        <div className="mt-3 pt-3 border-t border-border/40">
          <button
            onClick={() => navigate("/create-character")}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 painted-btn px-4 py-2.5 text-xs disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" /> Create New Operative
          </button>
        </div>
      )}

      {/* Purchase an additional slot (permanent — survives deletion) */}
      {canPurchase && (
        <div className="mt-3 pt-3 border-t border-border/40">
          <button
            onClick={handlePurchase}
            disabled={purchasing || loading || !activeId}
            className="w-full flex items-center justify-center gap-2 painted-btn painted-btn-accent px-4 py-2.5 text-xs disabled:opacity-50"
          >
            {purchasing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Unlock Slot · {SLOT_COST} <Gem className="w-3.5 h-3.5" style={{ color: "#FFD700" }} />
          </button>
          <p className="text-[10px] text-muted-foreground text-center mt-1.5">
            Permanent — the slot stays yours even if an operative is deleted.
          </p>
        </div>
      )}

      {!canCreate && !canPurchase && (
        <p className="text-[10px] text-muted-foreground text-center mt-3">All {MAX_SLOTS} slots filled.</p>
      )}
    </div>
  );
}
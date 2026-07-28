import React from "react";
import { Gift } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import ItemGrantForm from "@/components/admin/ItemGrantForm";
import CurrencyAdjustForm from "@/components/admin/CurrencyAdjustForm";
import { api } from "@/api/gameClient";
import { useToast } from "@/components/ui/use-toast";

/** Compact admin-only spawn on the character sheet (active operative). */
export default function AdminSelfGrant({ character, onGranted }) {
  const { user } = useAuth();
  const { toast } = useToast();
  if (user?.role !== "admin" || !character?.id) return null;

  async function onAction(payload) {
    try {
      const res = await api.functions.invoke("AdminModeration", payload);
      const data = res.data ?? res;
      if (payload.action === "give_item" && data?.item) {
        toast({
          title: "Gear granted",
          description: `${data.item.name} → ${character.name}`,
        });
      } else if (payload.action === "adjust_currency") {
        toast({ title: "Currency updated", description: `${character.name}'s balances were adjusted.` });
      } else if (!data?.success && data?.error) {
        toast({ title: "Failed", description: data.error, variant: "destructive" });
      }
      return data;
    } catch (e) {
      toast({
        title: "Failed",
        description: e?.response?.data?.error || e.message,
        variant: "destructive",
      });
      return null;
    }
  }

  return (
    <div className="rounded-xl border border-primary/35 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Gift className="w-3.5 h-3.5 text-primary" />
        <h3 className="text-[10px] font-display font-bold tracking-wide text-primary">
          ADMIN · SPAWN FOR {character.name.toUpperCase()}
        </h3>
      </div>
      <ItemGrantForm
        character={character}
        onAction={onAction}
        onGranted={() => onGranted?.()}
      />
      <CurrencyAdjustForm
        character={character}
        onAction={onAction}
        onDone={() => onGranted?.()}
      />
    </div>
  );
}

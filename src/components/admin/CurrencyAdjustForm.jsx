import React, { useState } from "react";
import { Coins, ArrowUp, ArrowDown } from "lucide-react";

const FIELDS = [
  { key: "stardust", label: "Stardust", icon: "✨" },
  { key: "nova_crystals", label: "Nova Crystals", icon: "💎" },
  { key: "fuel", label: "Fuel", icon: "⛽" },
];

export default function CurrencyAdjustForm({ character, onAction, onDone }) {
  const [currency, setCurrency] = useState("stardust");
  const [amount, setAmount] = useState(100);

  async function apply(sign) {
    const amt = Math.abs(+amount || 0) * sign;
    if (!amt) return;
    await onAction({ action: "adjust_currency", character_id: character.id, deltas: { [currency]: amt } });
    onDone && onDone();
  }

  return (
    <div className="space-y-2 p-2.5 rounded-lg bg-muted/15 border border-border/20">
      <h4 className="text-xs font-display font-semibold text-muted-foreground flex items-center gap-1.5"><Coins className="w-3.5 h-3.5" /> ADJUST CURRENCY</h4>
      <div className="flex gap-1.5">
        <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="flex-1 bg-muted/40 border border-border/40 rounded-lg px-2 py-1.5 text-xs">
          {FIELDS.map((f) => <option key={f.key} value={f.key}>{f.icon} {f.label}</option>)}
        </select>
        <input type="number" value={amount} onChange={(e) => setAmount(+e.target.value)} className="w-20 bg-muted/40 border border-border/40 rounded-lg px-2 py-1.5 text-xs" />
      </div>
      <div className="flex gap-1.5">
        <button onClick={() => apply(1)} className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-lg bg-green-500/15 text-green-300"><ArrowUp className="w-3 h-3" />Add</button>
        <button onClick={() => apply(-1)} className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-lg bg-red-500/15 text-red-300"><ArrowDown className="w-3 h-3" />Remove</button>
      </div>
    </div>
  );
}
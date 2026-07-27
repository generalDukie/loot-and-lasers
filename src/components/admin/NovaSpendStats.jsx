import React, { useState, useEffect } from "react";
import { api } from "@/api/gameClient";
import { Gem, RefreshCw, Loader2 } from "lucide-react";

const SOURCE_LABELS = {
  mission_skip: "Mission Skip",
  fuel_purchase: "Fuel Refill",
  character_slot: "Character Slot",
  fuel_mount: "Fuel Mount",
  rename: "Operative Rename",
  arena: "Arena Battle/Skip",
  casino: "Casino Wager",
  dungeon_skip: "Dungeon Skip",
  dungeon_revive: "Dungeon Revive",
  ship_purchase: "Ship Purchase",
  shop_refresh_gear: "Shop Refresh (Gear)",
  shop_refresh_cons: "Shop Refresh (Stims)",
  shop_buy_legendary: "Legendary Gear Purchase",
};

// Admin-only analytics dashboard for Nova Crystal spending behaviour.
// Reads NovaSpendEvent records (RLS-gated to admins) and aggregates by
// source, top spenders, and recent activity.
export default function NovaSpendStats() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const list = await api.entities.NovaSpendEvent.list("-created_date", 500);
      setEvents(list || []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const totalSpent = events.reduce((s, e) => s + (e.amount || 0), 0);
  const bySource = {};
  const byChar = {};
  for (const e of events) {
    bySource[e.source] = bySource[e.source] || { amount: 0, count: 0 };
    bySource[e.source].amount += e.amount || 0;
    bySource[e.source].count += 1;
    const key = e.character_name || e.character_id || "Unknown";
    byChar[key] = (byChar[key] || 0) + (e.amount || 0);
  }
  const sourceRows = Object.entries(bySource).sort((a, b) => b[1].amount - a[1].amount);
  const topSpenders = Object.entries(byChar).sort((a, b) => b[1] - a[1]).slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gem className="w-4 h-4 text-amber-300" />
          <h2 className="font-display font-semibold text-sm">Nova Crystal Analytics</h2>
        </div>
        <button onClick={load} className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="painted-panel canvas-grain p-3 text-center">
          <p className="font-display font-bold text-xl text-amber-300">{totalSpent.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">Total 💎 Spent</p>
        </div>
        <div className="painted-panel canvas-grain p-3 text-center">
          <p className="font-display font-bold text-xl text-amber-300">{events.length.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">Spend Events</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="painted-panel canvas-grain p-3">
            <p className="text-[11px] font-display font-semibold mb-2 text-muted-foreground">SPEND BY SOURCE</p>
            <div className="space-y-1.5">
              {sourceRows.length === 0 && <p className="text-xs text-muted-foreground italic">No data yet.</p>}
              {sourceRows.map(([src, v]) => (
                <div key={src} className="flex items-center justify-between text-xs">
                  <span className="truncate">{SOURCE_LABELS[src] || src}</span>
                  <span className="tabular-nums text-amber-300 font-semibold">{v.amount.toLocaleString()} 💎 <span className="text-muted-foreground">×{v.count}</span></span>
                </div>
              ))}
            </div>
          </div>

          <div className="painted-panel canvas-grain p-3">
            <p className="text-[11px] font-display font-semibold mb-2 text-muted-foreground">TOP SPENDERS</p>
            <div className="space-y-1.5">
              {topSpenders.length === 0 && <p className="text-xs text-muted-foreground italic">No data yet.</p>}
              {topSpenders.map(([name, amt], i) => (
                <div key={name} className="flex items-center justify-between text-xs">
                  <span className="truncate"><span className="text-muted-foreground mr-1">#{i + 1}</span>{name}</span>
                  <span className="tabular-nums text-amber-300 font-semibold">{amt.toLocaleString()} 💎</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="painted-panel canvas-grain p-3">
        <p className="text-[11px] font-display font-semibold mb-2 text-muted-foreground">RECENT ACTIVITY</p>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {events.length === 0 && <p className="text-xs text-muted-foreground italic">No data yet.</p>}
          {events.slice(0, 50).map((e) => (
            <div key={e.id} className="flex items-center justify-between text-[11px] py-1 border-b border-border/20 last:border-0">
              <span className="truncate flex-1 min-w-0 mr-2">
                <span className="text-amber-300 font-semibold">-{e.amount}💎</span>{" "}
                <span className="text-muted-foreground">{SOURCE_LABELS[e.source] || e.source}</span>{" "}
                <span className="text-foreground/80">· {e.character_name || "Unknown"}</span>
              </span>
              <span className="text-muted-foreground tabular-nums shrink-0">{new Date(e.created_date).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
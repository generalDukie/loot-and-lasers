import React, { useState, useEffect, useCallback } from "react";
import { api } from "@/api/gameClient";
import { Gem, RefreshCw, Loader2, Coins, Wallet } from "lucide-react";
import StardustIcon from "@/components/game/StardustIcon";
import { STARDUST_COLOR } from "@/lib/gameData";

const NOVA_SOURCE_LABELS = {
  mission_skip: "Mission Skip",
  fuel_purchase: "Fuel Refill",
  character_slot: "Character Slot",
  fuel_mount: "Fuel Mount",
  rename: "Operative Rename",
  arena: "Arena Battle/Skip",
  casino: "Casino Wager",
  dungeon_skip: "Dungeon Skip",
  dungeon_revive: "Dungeon Revive",
  dungeon_continue: "Dungeon Continue",
  ship_purchase: "Ship Purchase",
  shop_refresh_gear: "Shop Refresh (Gear)",
  shop_refresh_cons: "Shop Refresh (Stims)",
  shop_buy_legendary: "Legendary Gear Purchase",
};

const STARDUST_SOURCE_LABELS = {
  attribute: "Attribute Point",
  ship_mod: "Ship Mod",
  arena_refresh: "Arena Opponent Refresh",
  shop_buy: "Black Market Purchase",
  shop_consumable: "Stim Lab Purchase",
  casino: "Casino Wager",
  fuel_mount: "Fuel Mount",
  guild_create: "Found Guild",
  guild_war: "Guild War Declare",
  guild_war_sim: "Guild War Sim",
};

const LIVE_POLL_MS = 15000;

function aggregateSpend(events) {
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
  return {
    totalSpent,
    sourceRows: Object.entries(bySource).sort((a, b) => b[1].amount - a[1].amount),
    topSpenders: Object.entries(byChar).sort((a, b) => b[1] - a[1]).slice(0, 10),
  };
}

function SpendPanel({
  title,
  icon,
  accentClass,
  accentStyle,
  events,
  labels,
  glyph,
  loading,
}) {
  const { totalSpent, sourceRows, topSpenders } = aggregateSpend(events);
  const amountStyle = accentStyle || undefined;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="font-display font-semibold text-sm">{title}</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="painted-panel canvas-grain p-3 text-center">
          <p className={`font-display font-bold text-xl ${accentClass || ""}`} style={amountStyle}>
            {totalSpent.toLocaleString()}
          </p>
          <p className="text-[10px] text-muted-foreground">Total {glyph} Spent (logged)</p>
        </div>
        <div className="painted-panel canvas-grain p-3 text-center">
          <p className={`font-display font-bold text-xl ${accentClass || ""}`} style={amountStyle}>
            {events.length.toLocaleString()}
          </p>
          <p className="text-[10px] text-muted-foreground">Spend Events</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="painted-panel canvas-grain p-3">
            <p className="text-[11px] font-display font-semibold mb-2 text-muted-foreground">
              SPEND BY SOURCE
            </p>
            <div className="space-y-1.5">
              {sourceRows.length === 0 && (
                <p className="text-xs text-muted-foreground italic">No data yet.</p>
              )}
              {sourceRows.map(([src, v]) => (
                <div key={src} className="flex items-center justify-between text-xs gap-2">
                  <span className="truncate">{labels[src] || src}</span>
                  <span
                    className={`tabular-nums font-semibold shrink-0 ${accentClass || ""}`}
                    style={amountStyle}
                  >
                    {v.amount.toLocaleString()} {glyph}{" "}
                    <span className="text-muted-foreground font-normal">×{v.count}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="painted-panel canvas-grain p-3">
            <p className="text-[11px] font-display font-semibold mb-2 text-muted-foreground">
              TOP SPENDERS
            </p>
            <div className="space-y-1.5">
              {topSpenders.length === 0 && (
                <p className="text-xs text-muted-foreground italic">No data yet.</p>
              )}
              {topSpenders.map(([name, amt], i) => (
                <div key={name} className="flex items-center justify-between text-xs gap-2">
                  <span className="truncate">
                    <span className="text-muted-foreground mr-1">#{i + 1}</span>
                    {name}
                  </span>
                  <span
                    className={`tabular-nums font-semibold shrink-0 ${accentClass || ""}`}
                    style={amountStyle}
                  >
                    {amt.toLocaleString()} {glyph}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="painted-panel canvas-grain p-3">
        <p className="text-[11px] font-display font-semibold mb-2 text-muted-foreground">
          RECENT ACTIVITY
        </p>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {events.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No data yet.</p>
          )}
          {events.slice(0, 40).map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between text-[11px] py-1 border-b border-border/20 last:border-0 gap-2"
            >
              <span className="truncate flex-1 min-w-0">
                <span className={`font-semibold ${accentClass || ""}`} style={amountStyle}>
                  -{e.amount}
                  {glyph}
                </span>{" "}
                <span className="text-muted-foreground">{labels[e.source] || e.source}</span>{" "}
                <span className="text-foreground/80">· {e.character_name || "Unknown"}</span>
              </span>
              <span className="text-muted-foreground tabular-nums shrink-0">
                {new Date(e.created_date).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Admin economy dashboard: live currency in circulation + Nova/Stardust spend analytics.
 */
export default function NovaSpendStats() {
  const [novaEvents, setNovaEvents] = useState([]);
  const [stardustEvents, setStardustEvents] = useState([]);
  const [circulation, setCirculation] = useState({
    stardust: 0,
    nova: 0,
    characters: 0,
    holdersSd: 0,
    holdersNova: 0,
    updatedAt: null,
  });
  const [loading, setLoading] = useState(true);
  const [liveLoading, setLiveLoading] = useState(false);

  const loadCirculation = useCallback(async () => {
    setLiveLoading(true);
    try {
      const chars = await api.entities.Character.list("-created_date", 5000);
      let stardust = 0;
      let nova = 0;
      let holdersSd = 0;
      let holdersNova = 0;
      for (const c of chars || []) {
        const sd = Number(c.stardust) || 0;
        const nv = Number(c.nova_crystals) || 0;
        stardust += sd;
        nova += nv;
        if (sd > 0) holdersSd += 1;
        if (nv > 0) holdersNova += 1;
      }
      setCirculation({
        stardust,
        nova,
        characters: (chars || []).length,
        holdersSd,
        holdersNova,
        updatedAt: new Date(),
      });
    } catch {
      /* keep last snapshot */
    } finally {
      setLiveLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nova, sd] = await Promise.all([
        api.entities.NovaSpendEvent.list("-created_date", 500).catch(() => []),
        api.entities.StardustSpendEvent.list("-created_date", 500).catch(() => []),
      ]);
      setNovaEvents(nova || []);
      setStardustEvents(sd || []);
      await loadCirculation();
    } finally {
      setLoading(false);
    }
  }, [loadCirculation]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(loadCirculation, LIVE_POLL_MS);
    return () => clearInterval(id);
  }, [loadCirculation]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-primary" />
          <h2 className="font-display font-semibold text-sm">Economy Analytics</h2>
        </div>
        <button
          type="button"
          onClick={load}
          className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1"
        >
          <RefreshCw className={`w-3 h-3 ${loading || liveLoading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Live money supply */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-display font-semibold text-muted-foreground flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5" /> IN CIRCULATION (LIVE)
          </p>
          <p className="text-[10px] text-muted-foreground tabular-nums">
            {circulation.updatedAt
              ? `Updated ${circulation.updatedAt.toLocaleTimeString()} · polls every ${LIVE_POLL_MS / 1000}s`
              : "Loading…"}
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div
            className="painted-panel canvas-grain p-4 relative overflow-hidden"
            style={{ borderColor: `${STARDUST_COLOR}40` }}
          >
            <div className="flex items-center gap-2 mb-1">
              <StardustIcon className="w-4 h-4" />
              <span className="text-[11px] font-display font-semibold text-muted-foreground">
                Stardust in wallets
              </span>
            </div>
            <p className="font-display font-bold text-2xl tabular-nums" style={{ color: STARDUST_COLOR }}>
              {circulation.stardust.toLocaleString()}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Across {circulation.characters.toLocaleString()} operatives ·{" "}
              {circulation.holdersSd.toLocaleString()} holding &gt;0
            </p>
          </div>
          <div className="painted-panel canvas-grain p-4 border border-amber-500/25">
            <div className="flex items-center gap-2 mb-1">
              <Gem className="w-4 h-4 text-amber-300" />
              <span className="text-[11px] font-display font-semibold text-muted-foreground">
                Nova Crystals in wallets
              </span>
            </div>
            <p className="font-display font-bold text-2xl tabular-nums text-amber-300">
              {circulation.nova.toLocaleString()}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Across {circulation.characters.toLocaleString()} operatives ·{" "}
              {circulation.holdersNova.toLocaleString()} holding &gt;0
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-border/30 pt-4">
        <SpendPanel
          title="Nova Crystal Spend"
          icon={<Gem className="w-4 h-4 text-amber-300" />}
          accentClass="text-amber-300"
          events={novaEvents}
          labels={NOVA_SOURCE_LABELS}
          glyph="💎"
          loading={loading}
        />
      </div>

      <div className="border-t border-border/30 pt-4">
        <SpendPanel
          title="Stardust Spend"
          icon={<StardustIcon className="w-4 h-4" />}
          accentStyle={{ color: STARDUST_COLOR }}
          events={stardustEvents}
          labels={STARDUST_SOURCE_LABELS}
          glyph="✦"
          loading={loading}
        />
      </div>
    </div>
  );
}

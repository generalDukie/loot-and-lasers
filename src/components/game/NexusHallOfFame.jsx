import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/api/gameClient";
import { formatReign } from "@/lib/nexusEngine";
import { Trophy, Clock, Shield, Crown } from "lucide-react";

export default function NexusHallOfFame() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.entities.NexusHallOfFame.list("-lost_at", 50)
      .then((r) => setRecords(r || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">Loading legend...</div>;
  }

  // Aggregates
  const byGuild = {};
  (records || []).forEach((r) => {
    if (!byGuild[r.guild_id]) byGuild[r.guild_id] = { name: r.guild_name, tag: r.guild_tag, reigns: 0, totalDays: 0, defenses: 0, captures: 0, longest: 0 };
    const g = byGuild[r.guild_id];
    g.reigns += 1;
    g.totalDays += r.reign_days || 0;
    g.defenses += r.defenses || 0;
    g.captures = r.captures || g.captures;
    g.longest = Math.max(g.longest, r.reign_days || 0);
  });
  const ranked = Object.values(byGuild).sort((a, b) => b.totalDays - a.totalDays);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 18, delay: 0.2 }}
      className="rounded-2xl border border-border/60 painted-panel canvas-grain p-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <Crown className="w-5 h-5 text-amber-300" />
        <h2 className="font-display font-bold text-sm tracking-widest text-amber-300">HALL OF FAME</h2>
        <span className="text-[10px] text-muted-foreground ml-auto">Never resets</span>
      </div>

      {ranked.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6 italic">No legends yet. The first conquest will echo through history.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <Agg icon={Clock} label="Longest Reign" value={`${ranked[0]?.longest || 0}d`} winner={ranked[0]?.name} color="#A855F7" />
            <Agg icon={Shield} label="Most Defenses" value={Math.max(...ranked.map((g) => g.defenses), 0)} winner={ranked.find((g) => g.defenses === Math.max(...ranked.map((x) => x.defenses)))?.name} color="#34D399" />
            <Agg icon={Trophy} label="Most Captures" value={Math.max(...ranked.map((g) => g.captures), 0)} winner={ranked.find((g) => g.captures === Math.max(...ranked.map((x) => x.captures)))?.name} color="#FFD700" />
          </div>

          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {(records || []).slice(0, 12).map((r, i) => (
              <div key={r.id} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-muted/15 border border-border/20">
                <span className="text-[10px] text-muted-foreground font-mono w-5">{i + 1}.</span>
                <span className="font-display font-semibold truncate flex-1" style={{ color: "#FFD700" }}>
                  {r.guild_tag ? `[${r.guild_tag}] ` : ""}{r.guild_name}
                </span>
                <span className="text-muted-foreground">{r.reign_days || 0}d</span>
                <span className="text-muted-foreground/60">· {r.defenses || 0}🛡</span>
              </div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}

function Agg({ icon: Icon, label, value, winner, color }) {
  return (
    <div className="p-2 rounded-lg bg-muted/20 border border-border/30 text-center">
      <Icon className="w-3.5 h-3.5 mx-auto mb-1" style={{ color }} />
      <p className="font-display font-bold text-sm" style={{ color }}>{value}</p>
      <p className="text-[8px] text-muted-foreground uppercase tracking-wide">{label}</p>
      {winner && <p className="text-[9px] text-muted-foreground truncate mt-0.5">{winner}</p>}
    </div>
  );
}
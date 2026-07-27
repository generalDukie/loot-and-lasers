import React, { useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/api/gameClient";
import { useToast } from "@/components/ui/use-toast";
import {
  isNexusVulnerable, hoursUntilVulnerable, isEligible,
  NEXUS_MIN_GUILD_LEVEL, NEXUS_MIN_MEMBERS, NEXUS_MIN_POWER,
} from "@/lib/nexusEngine";
import { computeGuildPower } from "@/lib/guildEngine";
import { Swords, ShieldCheck, ShieldAlert, Zap } from "lucide-react";

export default function NexusDeclarePanel({ character, guild, members, nexus, onResolved, now }) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const power = computeGuildPower(guild, members);
  const eligible = isEligible(guild, members, power);
  const vuln = isNexusVulnerable(nexus, now);
  const isOwner = nexus && guild && nexus.owner_guild_id === guild.id;
  const canDeclare = eligible.ok && vuln && !isOwner && !busy;

  async function declare() {
    if (!canDeclare) return;
    setBusy(true);
    try {
      const res = await api.functions.invoke("ResolveNexusAssault", {
        attacker_guild_id: guild.id,
        character_id: character.id,
      });
      onResolved(res.data);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || "Assault failed.";
      toast({ title: "Assault Blocked", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const reqs = [
    { label: `Guild Level ≥ ${NEXUS_MIN_GUILD_LEVEL}`, ok: (guild.level || 1) >= NEXUS_MIN_GUILD_LEVEL },
    { label: `Active Members ≥ ${NEXUS_MIN_MEMBERS}`, ok: (members || []).length >= NEXUS_MIN_MEMBERS },
    { label: `Guild Power ≥ ${NEXUS_MIN_POWER}`, ok: power >= NEXUS_MIN_POWER },
    { label: "Leader or Officer", ok: ["leader", "officer"].includes(membershipRole()) },
  ];

  function membershipRole() {
    return (members || []).find((m) => m.character_id === character.id)?.role || "member";
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 18, delay: 0.1 }}
      className="rounded-2xl border border-border/60 painted-panel canvas-grain p-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <Swords className="w-5 h-5 text-primary" />
        <h2 className="font-display font-bold text-sm tracking-widest text-primary">DECLARE ASSAULT</h2>
      </div>

      <div className="space-y-2 mb-4">
        {reqs.map((r) => (
          <div key={r.label} className={`flex items-center gap-2 text-xs ${r.ok ? "text-green-400" : "text-muted-foreground"}`}>
            {r.ok ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5 text-destructive" />}
            <span>{r.label}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs mb-4 p-2 rounded-lg bg-muted/20 border border-border/30">
        <span className="text-muted-foreground">Projected Power</span>
        <span className="font-display font-bold text-primary">{power.toLocaleString()}</span>
      </div>

      <div className="mb-4 text-xs">
        {isOwner ? (
          <p className="text-amber-300">Your guild currently holds the Nexus — fortify and defend against challengers.</p>
        ) : !vuln ? (
          <p className="text-muted-foreground">The Nexus is fortified. It becomes vulnerable in ~{hoursUntilVulnerable(nexus, now)}h.</p>
        ) : !eligible.ok ? (
          <p className="text-destructive">{eligible.reason}</p>
        ) : (
          <p className="text-green-400">The Nexus is vulnerable. Strike now to claim the galaxy.</p>
        )}
      </div>

      <motion.button
        whileTap={{ scale: canDeclare ? 0.96 : 1 }}
        onClick={declare}
        disabled={!canDeclare}
        className={`w-full text-sm px-4 py-2.5 rounded-lg font-display font-bold tracking-wide flex items-center justify-center gap-2 transition-colors ${
          canDeclare ? "painted-btn" : "bg-muted/30 text-muted-foreground cursor-not-allowed"
        }`}
      >
        <Zap className="w-4 h-4" /> {busy ? "LAUNCHING ASSAULT..." : "LAUNCH ASSAULT"}
      </motion.button>
    </motion.div>
  );
}
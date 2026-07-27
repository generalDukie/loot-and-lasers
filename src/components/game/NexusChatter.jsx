import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getNexusState, formatReign } from "@/lib/nexusEngine";

// Living-world NPC chatter that references the current ruling guild.
// Drop onto any page (Home, Missions, Cantina) for an ever-present pulse.
export default function NexusChatter({ compact = false }) {
  const [nexus, setNexus] = useState(null);
  const [line, setLine] = useState(0);

  useEffect(() => {
    let mounted = true;
    getNexusState().then((n) => { if (mounted) setNexus(n); });
    const t = setInterval(() => getNexusState().then((n) => mounted && setNexus(n)), 60000);
    return () => { mounted = false; clearInterval(t); };
  }, []);

  const lines = buildLines(nexus);
  useEffect(() => {
    if (lines.length <= 1) return;
    const t = setInterval(() => setLine((l) => (l + 1) % lines.length), 7000);
    return () => clearInterval(t);
  }, [lines.length]);

  if (lines.length === 0) return null;
  const cur = lines[line % lines.length];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`rounded-xl border border-border/40 bg-card/40 backdrop-blur-sm p-3 flex items-start gap-2 ${compact ? "" : ""}`}
    >
      <motion.span animate={{ rotate: [-6, 6, -6] }} transition={{ duration: 2.5, repeat: Infinity }} className="text-lg shrink-0">📡</motion.span>
      <AnimatePresence mode="wait">
        <motion.p
          key={cur}
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ duration: 0.3 }}
          className="text-xs text-foreground/80 italic leading-relaxed"
        >
          {cur}
        </motion.p>
      </AnimatePresence>
    </motion.div>
  );
}

function buildLines(nexus) {
  if (!nexus || !nexus.owner_guild_id) {
    return [
      "The Nexus lies unclaimed... rumors swirl of guilds marshalling fleets.",
      "Station chatter: 'Who will be the first to take the Nexus?'",
    ];
  }
  const name = nexus.owner_guild_name;
  const held = formatReign(nexus.captured_at);
  const streak = nexus.defense_streak || 0;
  const vuln = (() => {
    if (!nexus.captured_at) return false;
    return Date.now() - new Date(nexus.captured_at).getTime() >= 24 * 3600 * 1000;
  })();
  const out = [
    `Have you heard? ${name} rules the galaxy now.`,
    `The Nexus hasn't fallen in ${held}. ${name} stands firm.`,
  ];
  if (streak > 0) out.push(`${name} has repelled ${streak} assault${streak > 1 ? "s" : ""}. Legend grows.`);
  if (vuln) out.push(`Whispers in the cantina: 'The Nexus is vulnerable — someone make a move.'`);
  return out;
}
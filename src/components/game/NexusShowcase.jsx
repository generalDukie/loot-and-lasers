import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { getNexusState, formatReign } from "@/lib/nexusEngine";
import { Crown, ChevronRight } from "lucide-react";

// Server-wide showcase banner — surfaces "who controls the galaxy today"
// on the landing hub so the ruling guild is always visible.
export default function NexusShowcase() {
  const [nexus, setNexus] = useState(null);

  useEffect(() => {
    let mounted = true;
    getNexusState().then((n) => mounted && setNexus(n));
    const t = setInterval(() => getNexusState().then((n) => mounted && setNexus(n)), 60000);
    return () => { mounted = false; clearInterval(t); };
  }, []);

  const unclaimed = !nexus || !nexus.owner_guild_id;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 18 }}
    >
      <Link
        to="/nexus"
        className="block rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm px-4 py-3 hover:border-amber-400/40 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <motion.div animate={{ rotate: [-4, 4, -4] }} transition={{ duration: 3, repeat: Infinity }} className="shrink-0">
            <Crown className="w-5 h-5 text-amber-300" />
          </motion.div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-display tracking-widest text-amber-300/80 uppercase">Galactic Command Nexus</p>
            {unclaimed ? (
              <p className="text-sm font-display font-semibold text-destructive">Unclaimed — vulnerable to assault</p>
            ) : (
              <p className="text-sm font-display font-semibold truncate" style={{ color: nexus.banner_color || "#FFD700" }}>
                Held by [{nexus.owner_guild_tag}] {nexus.owner_guild_name} · {formatReign(nexus.captured_at)}
              </p>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </div>
      </Link>
    </motion.div>
  );
}
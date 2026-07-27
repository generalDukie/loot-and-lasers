import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ALIEN_SPECIES, ARTIFACTS, RELICS } from "@/lib/collectibles";
import { DUNGEON_PLANETS } from "@/lib/dungeonData";
import { GEAR_CATALOG, RARITY_COLORS } from "@/lib/gameData";
import { getCollectionStats } from "@/lib/collectionBonus";
import SpeciesAvatar from "@/components/game/SpeciesAvatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Dna, Award, Scroll, Gem, Swords, Maximize2 } from "lucide-react";

const GEAR_EMOJI = { weapon: "⚔️", armor: "🛡️", helmet: "⛑️", boots: "🥾", legs: "🦵", neck: "📿", accessory: "💍", ship_module: "🚀", material: "📦", consumable: "🧪" };

const TABS = [
  { key: "species", label: "Species", icon: Dna },
  { key: "badges", label: "Badges", icon: Award },
  { key: "artifacts", label: "Artifacts", icon: Scroll },
  { key: "relics", label: "Relics", icon: Gem },
  { key: "gear", label: "Gear", icon: Swords },
];

function ProgressRow({ discovered, total, color = "hsl(var(--primary))" }) {
  const pct = total > 0 ? Math.round((discovered / total) * 100) : 0;
  return (
    <div className="mb-3">
      <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
        <span>Discovered</span>
        <span className="font-display font-bold">{discovered}/{total} · {pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted/30 overflow-hidden border border-border/30">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

export default function CollectiblesLog({ character }) {
  const [tab, setTab] = useState("species");
  const [open, setOpen] = useState(false);
  const species = character.discovered_species || [];
  const arts = character.collected_artifacts || [];
  const relics = character.collected_relics || [];
  const discoveredGear = character.discovered_gear || [];
  const clearedPlanets = Math.max(0, (character.dungeon_planet || 1) - 1);
  const gearCatalog = GEAR_CATALOG;

  const gearDiscovered = discoveredGear.filter((id) => gearCatalog.some((g) => g.id === id)).length;
  const totalStats = getCollectionStats(character);

  const tabCount = (key) =>
    key === "species" ? `${species.length}/${ALIEN_SPECIES.length}`
    : key === "badges" ? `${clearedPlanets}/${DUNGEON_PLANETS.length}`
    : key === "artifacts" ? `${arts.length}/${ARTIFACTS.length}`
    : key === "relics" ? `${relics.length}/${RELICS.length}`
    : `${gearDiscovered}/${gearCatalog.length}`;

  const fullContent = (
    <div>
      {/* Total collection + XP bonus */}
      <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-display font-bold text-primary">TOTAL COLLECTION</span>
          <span className="text-xs font-display font-bold text-primary">{totalStats.discovered}/{totalStats.total} · {totalStats.percentage}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted/30 overflow-hidden border border-border/30">
          <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${totalStats.percentage}%` }} transition={{ duration: 0.5, ease: "easeOut" }} />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">✨ XP Bonus: +{totalStats.percentage}% from all sources</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 transition-colors ${
                active ? "border-accent bg-accent/10 text-accent border-glow-purple" : "border-border/50 text-muted-foreground hover:bg-muted/30"
              }`}
            >
              <t.icon className="w-3.5 h-3.5" /> {t.label}
              <span className="text-[9px] opacity-70">{tabCount(t.key)}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {tab === "species" && (
            <div>
              <ProgressRow discovered={species.length} total={ALIEN_SPECIES.length} color="#22D3EE" />
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {ALIEN_SPECIES.map((sp) => {
                  const found = species.includes(sp.id);
                  return (
                    <div key={sp.id} className={`rounded-lg border p-2 flex flex-col items-center text-center ${found ? "border-border/50 bg-card/40" : "border-dashed border-border/20 bg-muted/5"}`}>
                      <SpeciesAvatar species={sp} size={56} discovered={found} />
                      <p className="text-[10px] font-display font-bold mt-1 truncate w-full" style={{ color: found ? sp.color : "#6b7280" }}>{found ? sp.name : "???"}</p>
                      <p className="text-[8px] capitalize mt-0.5" style={{ color: found ? (RARITY_COLORS[sp.rarity] || sp.color) : "#6b7280" }}>{found ? sp.rarity : "Unknown"}</p>
                      <p className="text-[8px] text-muted-foreground/70 leading-tight line-clamp-1 mt-0.5">{found ? sp.lore : "Undiscovered"}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "badges" && (
            <div>
              <ProgressRow discovered={clearedPlanets} total={DUNGEON_PLANETS.length} color="#FBBF24" />
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {DUNGEON_PLANETS.map((p) => {
                  const earned = p.id <= clearedPlanets;
                  return (
                    <div key={p.id} className={`rounded-lg border p-3 flex flex-col items-center text-center ${earned ? "border-amber-500/40 bg-amber-500/5" : "border-dashed border-border/20 bg-muted/5"}`}>
                      <span className="text-3xl" style={{ filter: earned ? "none" : "grayscale(1) opacity(0.4)" }}>{p.icon}</span>
                      <p className="text-[10px] font-display font-bold mt-1" style={{ color: earned ? p.color : "#6b7280" }}>{p.name}</p>
                      <p className="text-[8px] mt-0.5" style={{ color: earned ? "#FBBF24" : "#6b7280" }}>{earned ? "🏆 Conquered" : "🔒 Locked"}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "artifacts" && (
            <div>
              <ProgressRow discovered={arts.length} total={ARTIFACTS.length} color="#A855F7" />
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {ARTIFACTS.map((a) => {
                  const found = arts.includes(a.id);
                  const color = RARITY_COLORS[a.rarity] || "#9CA3AF";
                  return (
                    <div key={a.id} className={`rounded-lg border p-2 flex flex-col items-center text-center ${found ? "bg-card/40" : "border-dashed border-border/20 bg-muted/5"}`} style={found ? { borderColor: color + "55" } : {}}>
                      <span className="text-2xl" style={{ filter: found ? "none" : "grayscale(1) opacity(0.4)" }}>{found ? a.emoji : "📜"}</span>
                      <p className="text-[9px] font-display font-bold mt-1 truncate w-full" style={{ color: found ? color : "#6b7280" }}>{found ? a.name : "???"}</p>
                      <p className="text-[8px] capitalize" style={{ color: found ? color : "#6b7280" }}>{found ? a.rarity : "Unknown"}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "relics" && (
            <div>
              <ProgressRow discovered={relics.length} total={RELICS.length} color="#3B82F6" />
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5">
                {RELICS.map((r) => {
                  const found = relics.includes(r.id);
                  const color = RARITY_COLORS[r.rarity] || "#9CA3AF";
                  return (
                    <div key={r.id} className={`rounded-md border p-1.5 flex flex-col items-center text-center ${found ? "bg-card/30" : "border-dashed border-border/15 bg-muted/5"}`} style={found ? { borderColor: color + "55" } : {}}>
                      <span className="text-base" style={{ filter: found ? "none" : "grayscale(1) opacity(0.4)" }}>{found ? r.emoji : "🔒"}</span>
                      <p className="text-[8px] truncate w-full mt-0.5" style={{ color: found ? color : "#4b5563" }}>{found ? r.name : "???"}</p>
                      <p className="text-[7px] capitalize" style={{ color: found ? color : "#4b5563" }}>{found ? r.rarity : ""}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "gear" && (
            <div>
              <ProgressRow discovered={gearDiscovered} total={gearCatalog.length} color="#22D3EE" />
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {gearCatalog.map((it) => {
                  const found = discoveredGear.includes(it.id);
                  const color = "#22D3EE";
                  return (
                    <div key={it.id} className={`rounded-lg border p-2 flex flex-col items-center text-center ${found ? "bg-card/40" : "border-dashed border-border/20 bg-muted/5"}`} style={found ? { borderColor: color + "55" } : {}}>
                      <span className="text-2xl" style={{ filter: found ? "none" : "grayscale(1) opacity(0.4)" }}>{found ? (GEAR_EMOJI[it.type] || "📦") : "🔒"}</span>
                      <p className="text-[9px] font-display font-bold mt-1 truncate w-full" style={{ color: found ? color : "#6b7280" }}>{found ? it.name : "???"}</p>
                      <p className="text-[8px] capitalize" style={{ color: found ? color : "#6b7280" }}>{found ? it.type.replace("_", " ") : "Unknown"}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="w-full text-left bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-4 hover:bg-card/70 hover:border-accent/40 transition-colors group">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-sm tracking-wide text-muted-foreground flex items-center gap-2">
              <Scroll className="w-4 h-4 text-accent" /> COSMIC VAULT
            </h2>
            <Maximize2 className="w-4 h-4 text-muted-foreground/50 group-hover:text-accent transition-colors" />
          </div>

          <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5 mb-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-display font-bold text-primary">TOTAL COLLECTION</span>
              <span className="text-[11px] font-display font-bold text-primary">{totalStats.discovered}/{totalStats.total} · {totalStats.percentage}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden border border-border/30">
              <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${totalStats.percentage}%` }} transition={{ duration: 0.5, ease: "easeOut" }} />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">✨ XP Bonus: +{totalStats.percentage}%</p>
          </div>

          <div className="flex gap-1.5 flex-wrap">
            {TABS.map((t) => (
              <span key={t.key} className="text-[10px] px-2 py-1 rounded-md border border-border/40 text-muted-foreground flex items-center gap-1">
                <t.icon className="w-3 h-3" /> {t.label}
                <span className="opacity-60">{tabCount(t.key)}</span>
              </span>
            ))}
          </div>
          <p className="text-[10px] text-accent mt-2 text-center font-medium">Tap to view full log →</p>
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Scroll className="w-4 h-4 text-accent" /> Cosmic Vault
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto pr-1 -mr-1 mt-2">
          {fullContent}
        </div>
      </DialogContent>
    </Dialog>
  );
}
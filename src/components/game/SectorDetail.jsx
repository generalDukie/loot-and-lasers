import React from "react";
import { motion } from "framer-motion";
import { DANGER_COLORS, DANGER_LABELS } from "@/lib/galaxyData";
import { spring } from "@/lib/goofyMotion";
import { RARITY_COLORS } from "@/lib/gameData";
import GameplayOverlayPortal from "@/components/game/GameplayOverlayPortal";
import { Shield, Gem, Orbit, X } from "lucide-react";

export default function SectorDetail({ sector, locked, onClose }) {
  const dangerColor = DANGER_COLORS[sector.danger];
  const rarityColor = RARITY_COLORS[sector.loot_rarity];

  return (
    <GameplayOverlayPortal
      className="z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0, y: 24 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={spring}
        className="w-full max-w-lg bg-card/90 border border-border/60 rounded-2xl overflow-hidden border-glow-cyan max-h-[85%] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        style={{ boxShadow: `0 0 30px ${sector.color}20` }}
      >
        {/* Header */}
        <div
          className="relative h-28 flex items-end p-4"
          style={{
            background: `linear-gradient(135deg, ${sector.color}30, ${sector.color}10)`,
            borderBottom: `1px solid ${sector.color}40`,
          }}
        >
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-lg bg-background/50 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <div>
            <p className="text-[10px] font-display font-semibold tracking-widest text-muted-foreground">SECTOR {sector.id}</p>
            <h2 className="font-display font-bold text-xl tracking-wider" style={{ color: sector.color }}>{sector.name}</h2>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed">{sector.description}</p>

          {/* Danger & Loot badges */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/20 rounded-xl p-3 border" style={{ borderColor: dangerColor + "30" }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Shield className="w-3.5 h-3.5" style={{ color: dangerColor }} />
                <span className="text-[10px] font-display font-semibold tracking-wider text-muted-foreground">DANGER</span>
              </div>
              <p className="font-display font-bold text-sm" style={{ color: dangerColor }}>{DANGER_LABELS[sector.danger]}</p>
            </div>
            <div className="bg-muted/20 rounded-xl p-3 border" style={{ borderColor: rarityColor + "30" }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Gem className="w-3.5 h-3.5" style={{ color: rarityColor }} />
                <span className="text-[10px] font-display font-semibold tracking-wider text-muted-foreground">LOOT RARITY</span>
              </div>
              <p className="font-display font-bold text-sm capitalize" style={{ color: rarityColor }}>{sector.loot_rarity}</p>
            </div>
          </div>

          {/* Planets */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Orbit className="w-3.5 h-3.5 text-primary" />
              <h3 className="text-xs font-display font-semibold tracking-wider text-muted-foreground">POINTS OF INTEREST</h3>
            </div>
            <div className="space-y-2">
              {sector.planets.map(planet => (
                <div key={planet.name} className="flex items-start gap-3 p-3 bg-muted/20 rounded-xl border border-border/40">
                  <span className="text-2xl shrink-0">{planet.icon}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{planet.name}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/50 text-muted-foreground">{planet.type}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{planet.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Lock notice */}
          {locked && (
            <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-xl border border-border/50">
              <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground">
                Clear missions in Sector {sector.id - 1} to unlock this region.
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </GameplayOverlayPortal>
  );
}
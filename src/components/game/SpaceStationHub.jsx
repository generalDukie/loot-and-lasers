import React, { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import StationAmbientToggle from "@/components/game/StationAmbientToggle";
import HubHeader from "@/components/game/HubHeader";
import StationSideButton from "@/components/game/StationSideButton";
import StationSplitButton from "@/components/game/StationSplitButton";
import CommandHubMedallion from "@/components/game/CommandHubMedallion";
import { useAuth } from "@/lib/AuthContext";
import { useHubLayout } from "@/hooks/useHubLayout";
import { useSiteConfig, HUB_GRID_SIZE } from "@/lib/SiteConfigContext";
import DraggableElement from "@/components/game/DraggableElement";
import HubEditModeToggle from "@/components/game/HubEditModeToggle";
import HubButtonEditor from "@/components/game/HubButtonEditor";
import { BUILTIN_BUTTONS, getBuiltin, mergeBuiltin, BTN_SIZE_W } from "@/lib/hubButtons";
import GameCanvas from "@/components/game/GameCanvas";

const STATION_IMG = "/assets/station-hub.png";

const NAV_ITEMS = [
  { label: "Nexus", icon: "⚡", to: "/nexus", color: "#A855F7" },
  { label: "Casino", icon: "🎰", to: "/casino", color: "#F59E0B" },
  { label: "Achievements", icon: "🎖️", to: "/achievements", color: "#F472B6" },
];

// Render a built-in hub button (merged with admin overrides) by its id.
function renderBuiltinButton(id, overrides, extra = {}) {
  const def = getBuiltin(id);
  const c = mergeBuiltin(def, overrides[id]);
  const common = { icon: c.icon, label: c.label, color: c.color, desc: c.desc };
  if (id === "command_hub") {
    return <CommandHubMedallion icon={c.icon} color={c.color} to={c.options[0]?.to} {...extra} />;
  }
  const widthCls = id === "cantina"
    ? "w-48 lg:w-72"
    : "w-40 lg:w-56";
  const btn = def.type === "split"
    ? <StationSplitButton {...common} options={c.options} {...extra} />
    : <StationSideButton {...common} to={c.options[0]?.to} {...extra} />;
  return <div className={widthCls}>{btn}</div>;
}

// Currencies now render inside CharacterNavMenu (CurrencyStack).

function ActionIcon({ to, children, badge, label }) {
  return (
    <Link to={to} className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors" title={label}>
      {children}
      {badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
          {badge}
        </span>
      )}
    </Link>
  );
}

function CenterButton({ icon, label, to, color, desc, delay, size = "lg" }) {
  const dims = size === "lg" ? "w-24 h-24 sm:w-28 sm:h-28 xl:w-32 xl:h-32 2xl:w-40 2xl:h-40" : "w-16 h-16 sm:w-20 sm:h-20 xl:w-24 xl:h-24 2xl:w-28 2xl:h-28";
  const iconCls = size === "lg" ? "text-4xl sm:text-5xl xl:text-6xl 2xl:text-7xl" : "text-2xl sm:text-3xl xl:text-4xl 2xl:text-5xl";
  const labelCls = size === "lg" ? "text-sm" : "text-xs";
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay, type: "spring", stiffness: 260, damping: 18 }}>
      <Link to={to} className="group flex flex-col items-center gap-1.5 focus:outline-none">
        <motion.div
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.93 }}
          className={`relative ${dims} rounded-full flex items-center justify-center border-2`}
          style={{
            borderColor: color,
            background: `radial-gradient(circle, ${color}22, hsl(232 30% 6% / 0.85))`,
            boxShadow: `0 0 24px ${color}44, inset 0 0 18px ${color}22`,
          }}
        >
          <div
            className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
            style={{ background: `radial-gradient(circle, ${color}33, transparent 70%)` }}
          />
          <span className={`${iconCls} relative`} style={{ filter: `drop-shadow(0 0 6px ${color}66)` }}>
            {icon}
          </span>
          {/* Rotating ring */}
          <motion.div
            className="absolute inset-0 rounded-full border border-dashed pointer-events-none"
            style={{ borderColor: color + "33" }}
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          />
        </motion.div>
        <div className="text-center px-2">
          <p className={`font-display font-bold ${labelCls} tracking-wide`} style={{ color }}>{label}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[150px] leading-tight">{desc}</p>
        </div>
      </Link>
    </motion.div>
  );
}

export default function SpaceStationHub({ character, children }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { positions, customButtons, builtinOverrides, savePosition, addCustomButton, updateCustomButton, removeCustomButton, updateBuiltin, resetBuiltin, resetLayout } = useHubLayout(user?.id);
  const { editMode, setEditMode, showGrid, theme } = useSiteConfig();
  const stationImg = theme?.station_background || STATION_IMG;
  const [editorOpen, setEditorOpen] = useState(false);

  const stageInner = (
    <div className="relative flex flex-col h-full w-full">
      {/* Main area — left / center / right */}
      <div className="relative z-10 flex-1 min-h-0 overflow-hidden flex flex-col lg:flex-row items-stretch gap-2 sm:gap-3 lg:gap-10 p-2 sm:p-3 lg:pb-20">
        {/* Left column */}
        <div className="flex flex-col items-center gap-4 sm:gap-6 lg:gap-10 lg:justify-center">
          <DraggableElement key="cantina" id="cantina" editMode={editMode} positions={positions} onSave={savePosition}>
            {renderBuiltinButton("cantina", builtinOverrides, { delay: 0.05 })}
          </DraggableElement>
          <DraggableElement id="hero_ship" editMode={editMode} positions={positions} onSave={savePosition}>
            {renderBuiltinButton("hero_ship", builtinOverrides, { delay: 0.1 })}
          </DraggableElement>
          <DraggableElement id="social" editMode={editMode} positions={positions} onSave={savePosition}>
            {renderBuiltinButton("social", builtinOverrides, { delay: 0.15 })}
          </DraggableElement>
        </div>

        {/* Center cluster — Galactic Frontier, Command Hub, Arena, Bazaar */}
        <div className="flex-1 flex flex-wrap items-center justify-center gap-3 sm:gap-4 lg:gap-8 min-h-[160px] sm:min-h-[200px] py-2 sm:py-4">
          <DraggableElement id="galactic_frontier" editMode={editMode} positions={positions} onSave={savePosition}>
            {renderBuiltinButton("galactic_frontier", builtinOverrides, { delay: 0.15 })}
          </DraggableElement>
          <DraggableElement id="command_hub" editMode={editMode} positions={positions} onSave={savePosition}>
            {renderBuiltinButton("command_hub", builtinOverrides, { delay: 0.2 })}
          </DraggableElement>
          <DraggableElement id="arena" editMode={editMode} positions={positions} onSave={savePosition}>
            {renderBuiltinButton("arena", builtinOverrides, { delay: 0.25 })}
          </DraggableElement>
          <DraggableElement id="bazaar" editMode={editMode} positions={positions} onSave={savePosition}>
            {renderBuiltinButton("bazaar", builtinOverrides, { delay: 0.3 })}
          </DraggableElement>
        </div>
      </div>

      {/* Custom admin buttons */}
      {customButtons.length > 0 && (
        <div className="relative z-10 flex flex-wrap items-center justify-center gap-2 sm:gap-3 px-2 sm:px-3 pb-2">
          {customButtons.map((btn) => (
            <DraggableElement key={btn.id} id={btn.id} editMode={editMode} positions={positions} onSave={savePosition}>
              <div className={BTN_SIZE_W[btn.size] || "w-40"}>
                <StationSplitButton {...btn} delay={0} />
              </div>
            </DraggableElement>
          ))}
        </div>
      )}

      {/* What's Happening — static full-width banner (mirrors the top header) */}
      {children && (
        <div className="relative z-20 px-3 pb-2">
          <div className="rounded-xl bg-background/90 border border-border/50 p-2.5 shadow-lg">
            <div className="flex items-center gap-3 overflow-x-auto [&>*]:shrink-0">
              {children}
            </div>
          </div>
        </div>
      )}

      {/* Ambient toggle — floating bottom-left */}
      <div className="hidden lg:block absolute bottom-16 left-3 z-20 rounded-lg bg-background/85 border border-border/50 overflow-hidden">
        <StationAmbientToggle />
      </div>

      {/* Custom button editor (admin only) */}
      {isAdmin && (
        <HubButtonEditor
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          buttons={customButtons}
          onAdd={addCustomButton}
          onUpdate={updateCustomButton}
          onRemove={removeCustomButton}
          builtinButtons={BUILTIN_BUTTONS}
          builtinOverrides={builtinOverrides}
          onUpdateBuiltin={updateBuiltin}
          onResetBuiltin={resetBuiltin}
        />
      )}
    </div>
  );

  return (
    <GameCanvas>
      {/* Full-screen station background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${stationImg})` }} />
        {/* Depth + quiet header band for UI readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/25 to-background/80" />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 70% 55% at 50% 45%, transparent 35%, hsl(232 32% 4% / 0.45) 100%)" }} />
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-background/50 to-transparent pointer-events-none" />
      </div>

      {/* Edit-mode grid lines */}
      {editMode && showGrid && (
        <div
          className="absolute inset-0 pointer-events-none z-0"
          style={{
            backgroundImage:
              "linear-gradient(to right, hsl(190 90% 50% / 0.18) 1px, transparent 1px), linear-gradient(to bottom, hsl(190 90% 50% / 0.18) 1px, transparent 1px)",
            backgroundSize: `${HUB_GRID_SIZE}px ${HUB_GRID_SIZE}px`,
          }}
        />
      )}

      <div className="relative z-10 h-full w-full flex flex-col">
        {/* Header */}
        <HubHeader
          character={character}
          rightExtras={isAdmin ? (
            <HubEditModeToggle editMode={editMode} onToggle={() => setEditMode(!editMode)} onReset={resetLayout} onManageButtons={() => setEditorOpen(true)} />
          ) : null}
        />

        {/* Responsive hub stage — fills the canvas like every other page */}
        <div className="relative z-10 flex-1 min-h-0 overflow-hidden">
          {stageInner}
        </div>
      </div>
    </GameCanvas>
  );
}
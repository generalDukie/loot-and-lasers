import React, { useState } from "react";
import { motion } from "framer-motion";
import { Pencil, Check, RotateCcw, LayoutGrid, Palette, Grid3x3, Magnet } from "lucide-react";
import ThemeEditor from "@/components/admin/ThemeEditor";
import { useSiteConfig } from "@/lib/SiteConfigContext";

// Admin-only toggle for hub layout edit mode, with reset + button manager + theme editor.
export default function HubEditModeToggle({ editMode, onToggle, onReset, onManageButtons }) {
  const [themeOpen, setThemeOpen] = useState(false);
  const { showGrid, setShowGrid, snapGrid, setSnapGrid } = useSiteConfig();

  return (
    <div className="flex items-center gap-1.5 mr-1">
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => setThemeOpen(true)}
        className="px-2 py-1.5 rounded-lg bg-accent/20 text-accent border border-accent/40 text-[10px] font-display font-bold flex items-center gap-1 hover:bg-accent/30 transition-colors"
        title="Edit global theme"
      >
        <Palette className="w-3 h-3" />
        Theme
      </motion.button>
      {editMode && (
        <>
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            whileTap={{ scale: 0.9 }}
            onClick={onManageButtons}
            className="px-2 py-1.5 rounded-lg bg-primary/20 text-primary border border-primary/40 text-[10px] font-display font-bold flex items-center gap-1"
            title="Add & edit buttons"
          >
            <LayoutGrid className="w-3 h-3" />
            Buttons
          </motion.button>
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowGrid(!showGrid)}
            className={`px-2 py-1.5 rounded-lg text-[10px] font-display font-bold flex items-center gap-1 border transition-colors ${
              showGrid ? "bg-primary/25 text-primary border-primary/60" : "bg-muted/40 text-muted-foreground border-border/50 hover:text-foreground"
            }`}
            title="Toggle grid lines"
          >
            <Grid3x3 className="w-3 h-3" />
            Grid
          </motion.button>
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setSnapGrid(!snapGrid)}
            className={`px-2 py-1.5 rounded-lg text-[10px] font-display font-bold flex items-center gap-1 border transition-colors ${
              snapGrid ? "bg-primary/25 text-primary border-primary/60" : "bg-muted/40 text-muted-foreground border-border/50 hover:text-foreground"
            }`}
            title="Snap buttons to grid"
          >
            <Magnet className="w-3 h-3" />
            Snap
          </motion.button>
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            whileTap={{ scale: 0.9 }}
            onClick={onReset}
            className="px-2 py-1.5 rounded-lg bg-destructive/20 text-destructive border border-destructive/40 text-[10px] font-display font-bold flex items-center gap-1"
            title="Reset layout to default"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </motion.button>
        </>
      )}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={onToggle}
        className={`px-2 py-1.5 rounded-lg text-[10px] font-display font-bold flex items-center gap-1 border transition-colors ${
          editMode
            ? "bg-primary/25 text-primary border-primary/60"
            : "bg-muted/40 text-muted-foreground border-border/50 hover:text-foreground"
        }`}
        title={editMode ? "Finish editing" : "Edit hub layout & text"}
      >
        {editMode ? <Check className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
        {editMode ? "Done" : "Edit"}
      </motion.button>
      <ThemeEditor open={themeOpen} onClose={() => setThemeOpen(false)} />
    </div>
  );
}
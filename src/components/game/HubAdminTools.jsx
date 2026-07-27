import React, { useState } from "react";
import { motion } from "framer-motion";
import { Palette, LayoutGrid } from "lucide-react";
import ThemeEditor from "@/components/admin/ThemeEditor";

// Admin hub tools — theme + button manager only (no freeform layout edit).
export default function HubAdminTools({ onManageButtons }) {
  const [themeOpen, setThemeOpen] = useState(false);

  return (
    <div className="flex items-center gap-1.5 mr-1">
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => setThemeOpen(true)}
        className="px-2 py-1.5 rounded-lg bg-accent/20 text-accent border border-accent/40 text-[10px] font-display font-bold flex items-center gap-1 hover:bg-accent/30 transition-colors"
        title="Edit global theme"
      >
        <Palette className="w-3 h-3" />
        <span className="hidden sm:inline">Theme</span>
      </motion.button>
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={onManageButtons}
        className="px-2 py-1.5 rounded-lg bg-primary/20 text-primary border border-primary/40 text-[10px] font-display font-bold flex items-center gap-1 hover:bg-primary/30 transition-colors"
        title="Add & edit hub buttons"
      >
        <LayoutGrid className="w-3 h-3" />
        <span className="hidden sm:inline">Buttons</span>
      </motion.button>
      <ThemeEditor open={themeOpen} onClose={() => setThemeOpen(false)} />
    </div>
  );
}

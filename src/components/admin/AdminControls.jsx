import React, { useState } from "react";
import { Palette, Pencil, Check } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useSiteConfig } from "@/lib/SiteConfigContext";
import ThemeEditor from "@/components/admin/ThemeEditor";

// Compact admin cluster (Edit toggle + Theme) for the shared TopBar — visible on every game page.
export default function AdminControls() {
  const { user } = useAuth();
  const { editMode, setEditMode } = useSiteConfig();
  const [themeOpen, setThemeOpen] = useState(false);

  if (user?.role !== "admin") return null;

  return (
    <>
      <div className="flex items-center gap-1 mr-1">
        <button
          onClick={() => setThemeOpen(true)}
          className="px-2 py-1.5 rounded-lg bg-accent/20 text-accent border border-accent/40 text-[10px] font-display font-bold flex items-center gap-1 hover:bg-accent/30 transition-colors"
          title="Edit global theme"
        >
          <Palette className="w-3 h-3" />
          <span className="hidden sm:inline">Theme</span>
        </button>
        <button
          onClick={() => setEditMode(!editMode)}
          className={`px-2 py-1.5 rounded-lg text-[10px] font-display font-bold flex items-center gap-1 border transition-colors ${
            editMode
              ? "bg-primary/25 text-primary border-primary/60"
              : "bg-muted/40 text-muted-foreground border-border/50 hover:text-foreground"
          }`}
          title={editMode ? "Exit edit mode" : "Edit text & layout"}
        >
          {editMode ? <Check className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
          {editMode ? "Done" : "Edit"}
        </button>
      </div>
      <ThemeEditor open={themeOpen} onClose={() => setThemeOpen(false)} />
    </>
  );
}
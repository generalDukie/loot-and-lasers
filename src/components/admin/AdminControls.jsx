import React, { useState } from "react";
import { Palette } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import ThemeEditor from "@/components/admin/ThemeEditor";

// Compact admin cluster for TopBar — theme only (layout is fixed/responsive).
export default function AdminControls() {
  const { user } = useAuth();
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
      </div>
      <ThemeEditor open={themeOpen} onClose={() => setThemeOpen(false)} />
    </>
  );
}

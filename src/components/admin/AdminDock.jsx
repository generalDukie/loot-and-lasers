import React, { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Palette, Pencil, Check, Shield, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useSiteConfig } from "@/lib/SiteConfigContext";
import ThemeEditor from "@/components/admin/ThemeEditor";

// Floating admin dock pinned to the right edge — admin-only quick actions
// (Theme, Edit toggle, Admin console). Collapsible to a thin tab.
export default function AdminDock() {
  const { user } = useAuth();
  const { editMode, setEditMode } = useSiteConfig();
  const [themeOpen, setThemeOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  if (user?.role !== "admin") return null;

  return (
    <>
      <motion.div
        initial={{ x: 60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 22, delay: 0.2 }}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-40 flex items-stretch"
      >
        {/* Collapse tab */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="self-center w-5 py-3 rounded-l-lg bg-primary/20 border border-l border-y border-primary/40 text-primary hover:bg-primary/30 transition-colors"
          title={collapsed ? "Show admin dock" : "Hide admin dock"}
        >
          {collapsed ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "auto", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-1.5 p-1.5 rounded-l-xl border border-r-0 border-border/60 bg-card/90 backdrop-blur-xl shadow-2xl">
                <button
                  onClick={() => setThemeOpen(true)}
                  className="w-10 h-10 rounded-lg bg-accent/20 text-accent border border-accent/40 flex items-center justify-center hover:bg-accent/30 transition-colors"
                  title="Edit global theme"
                >
                  <Palette className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setEditMode(!editMode)}
                  className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-colors ${
                    editMode
                      ? "bg-primary/25 text-primary border-primary/60"
                      : "bg-muted/40 text-muted-foreground border-border/50 hover:text-foreground"
                  }`}
                  title={editMode ? "Exit edit mode" : "Edit text & layout"}
                >
                  {editMode ? <Check className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                </button>
                <Link
                  to="/admin"
                  className="w-10 h-10 rounded-lg bg-primary/15 text-primary border border-primary/30 flex items-center justify-center hover:bg-primary/25 transition-colors"
                  title="Admin console"
                >
                  <Shield className="w-4 h-4" />
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      <ThemeEditor open={themeOpen} onClose={() => setThemeOpen(false)} />
    </>
  );
}
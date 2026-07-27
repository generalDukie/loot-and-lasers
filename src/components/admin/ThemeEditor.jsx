import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RotateCcw } from "lucide-react";
import { useSiteConfig } from "@/lib/SiteConfigContext";

// Live theme editor — changes apply globally the instant you make them.
export default function ThemeEditor({ open, onClose }) {
  const { theme, updateTheme } = useSiteConfig();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Theme Editor</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <ColorRow
            label="Primary Color"
            value={theme.primary_color}
            onChange={(v) => updateTheme({ primary_color: v })}
            onReset={() => updateTheme({ primary_color: "" })}
          />
          <ColorRow
            label="Accent Color"
            value={theme.accent_color}
            onChange={(v) => updateTheme({ accent_color: v })}
            onReset={() => updateTheme({ accent_color: "" })}
          />

          <div className="space-y-1.5">
            <label className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider">
              Station Background Image URL
            </label>
            <Input
              value={theme.station_background || ""}
              onChange={(e) => updateTheme({ station_background: e.target.value })}
              placeholder="https://… (leave empty for default)"
            />
            {theme.station_background && (
              <Button size="sm" variant="ghost" onClick={() => updateTheme({ station_background: "" })}>
                <RotateCcw className="w-3 h-3 mr-1" /> Reset
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider">Font (Display)</label>
              <Input value={theme.font_display || ""} onChange={(e) => updateTheme({ font_display: e.target.value })} placeholder="Orbitron" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider">Font (Body)</label>
              <Input value={theme.font_body || ""} onChange={(e) => updateTheme({ font_body: e.target.value })} placeholder="Exo 2" />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground leading-tight">
            Fonts must be installed/loaded in the app to apply. Colors and background update instantly for everyone.
          </p>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ColorRow({ label, value, onChange, onReset }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider flex-1">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="w-9 h-9 rounded-md border border-border/60 bg-transparent cursor-pointer"
          title={label}
        />
        {value && (
          <Button size="icon" variant="ghost" onClick={onReset} title="Reset to default">
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
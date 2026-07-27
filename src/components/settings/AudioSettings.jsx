import React, { useState, useEffect } from "react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Volume2, Music, Zap } from "lucide-react";
import {
  getVolumes,
  setVolumes,
  subscribeVolumes,
  getAudioPrefs,
  setPlayWhenMinimized,
  subscribeAudioPrefs,
} from "@/lib/audioEngine";

function Row({ icon: Icon, label, value, onChange }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="w-4 h-4 text-primary shrink-0" />
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium">{label}</span>
          <span className="text-[10px] text-muted-foreground tabular-nums">{value}</span>
        </div>
        <Slider value={[value]} min={0} max={100} step={1} onValueChange={([v]) => onChange(v)} />
      </div>
    </div>
  );
}

export default function AudioSettings() {
  const [vols, setVols] = useState(getVolumes());
  const [prefs, setPrefs] = useState(getAudioPrefs());

  useEffect(() => subscribeVolumes(setVols), []);
  useEffect(() => subscribeAudioPrefs(setPrefs), []);

  return (
    <div className="painted-panel canvas-grain p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Volume2 className="w-4 h-4 text-primary" />
        <h2 className="font-display font-semibold text-sm">Audio</h2>
      </div>
      <div className="space-y-4">
        <Row icon={Volume2} label="Master Volume" value={vols.master} onChange={(v) => setVolumes({ master: v })} />
        <Row icon={Music} label="Music Volume" value={vols.music} onChange={(v) => setVolumes({ music: v })} />
        <Row icon={Zap} label="SFX Volume" value={vols.sfx} onChange={(v) => setVolumes({ sfx: v })} />
      </div>
      <div className="flex items-start justify-between gap-3 pt-1 border-t border-border/40">
        <div className="min-w-0">
          <p className="text-xs font-medium">Play music when minimized</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
            Keep station ambience and cantina music running while the tab is in the background.
          </p>
        </div>
        <Switch
          checked={!!prefs.playWhenMinimized}
          onCheckedChange={(on) => setPlayWhenMinimized(on)}
          aria-label="Play music when minimized"
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Soft space ambience plays continuously across the station. The cantina has its own upbeat lounge tune.
      </p>
    </div>
  );
}

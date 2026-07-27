import React, { useState, useEffect } from "react";
import { Slider } from "@/components/ui/slider";
import { Volume2, Music, Zap } from "lucide-react";
import { getVolumes, setVolumes, subscribeVolumes } from "@/lib/audioEngine";

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

  useEffect(() => subscribeVolumes(setVols), []);

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
      <p className="text-[11px] text-muted-foreground">
        Cantina &amp; station ambience play automatically. Adjust levels to taste.
      </p>
    </div>
  );
}
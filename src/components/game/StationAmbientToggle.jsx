import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Radio, RadioTower } from "lucide-react";
import { startStationAmbient, stopStationAmbient, isStationAmbientPlaying } from "@/lib/stationAmbient";

export default function StationAmbientToggle({ compact = false }) {
  const [on, setOn] = useState(true);

  // Sound is always on — start as soon as the audio context is allowed.
  useEffect(() => {
    startStationAmbient();
    setOn(isStationAmbientPlaying());
    return () => { if (isStationAmbientPlaying()) stopStationAmbient(); };
  }, []);

  function toggle() {
    if (on) {
      stopStationAmbient();
      setOn(false);
    } else {
      startStationAmbient();
      setOn(true);
    }
  }

  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={toggle}
      className={`font-medium flex items-center gap-1 transition-colors border ${
        compact
          ? "text-[10px] px-2 py-0.5 rounded-full"
          : "text-xs px-3 py-1 rounded-full"
      } ${
        on
          ? "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-400/40"
          : "bg-muted/40 text-muted-foreground border-border/40 hover:text-foreground"
      }`}
      title={on ? "Mute station ambience" : "Play station ambience"}
    >
      {on ? <RadioTower className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} /> : <Radio className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />}
      {on ? "Ambience On" : "Ambience Off"}
    </motion.button>
  );
}
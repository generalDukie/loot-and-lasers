import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
import { startCantina, stopCantina, isCantinaPlaying } from "@/lib/cantinaAudio";

export default function CantinaMusicToggle() {
  const [on, setOn] = useState(true);

  // Sound is always on — start as soon as the audio context is allowed.
  useEffect(() => {
    startCantina();
    setOn(isCantinaPlaying());
    return () => { if (isCantinaPlaying()) stopCantina(); };
  }, []);

  function toggle() {
    if (on) {
      stopCantina();
      setOn(false);
    } else {
      startCantina();
      setOn(true);
    }
  }

  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={toggle}
      className={`text-xs px-3 py-1 rounded-full font-medium flex items-center gap-1 transition-colors border ${
        on
          ? "bg-primary/15 text-primary border-primary/40 border-glow-cyan"
          : "bg-muted/40 text-muted-foreground border-border/40 hover:text-foreground"
      }`}
      title={on ? "Mute cantina music" : "Play cantina music"}
    >
      {on ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
      {on ? "Music On" : "Music Off"}
    </motion.button>
  );
}
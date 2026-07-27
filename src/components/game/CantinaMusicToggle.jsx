import React, { useState } from "react";
import { motion } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
import { isCantinaMuted, setCantinaMuted } from "@/lib/soundtrack";

// Mute/unmute the cantina bed — soundtrack ownership stays with SoundtrackController.
export default function CantinaMusicToggle() {
  const [on, setOn] = useState(() => !isCantinaMuted());

  function toggle() {
    const nextOn = !on;
    setCantinaMuted(!nextOn);
    setOn(nextOn);
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
      title={on ? "Mute lounge music" : "Play lounge music"}
    >
      {on ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
      {on ? "Music On" : "Music Off"}
    </motion.button>
  );
}

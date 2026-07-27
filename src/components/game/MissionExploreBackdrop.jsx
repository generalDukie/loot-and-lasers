import React from "react";
import { motion } from "framer-motion";

// Large S&F-style exploration backdrops — one random scene is pinned per mission.
export const MISSION_EXPLORE_SCENES = [
  {
    src: "/assets/mission-explore/mission-explore-1.png",
    caption: "Emergency plumbing. The toilet launched first.",
  },
  {
    src: "/assets/mission-explore/mission-explore-2.png",
    caption: "Scientific observation. Definitely scientific.",
  },
  {
    src: "/assets/mission-explore/mission-explore-3.png",
    caption: "Vent reconnaissance. Exit strategy pending.",
  },
  {
    src: "/assets/mission-explore/mission-explore-4.png",
    caption: "Customs medical. Consent forms were optional.",
  },
  {
    src: "/assets/mission-explore/mission-explore-5.png",
    caption: "Asteroid rest stop. Leave no trace. Mostly.",
  },
  {
    src: "/assets/mission-explore/mission-explore-6.png",
    caption: "Diplomatic incident with a vending machine.",
  },
];

export function pickMissionExploreSceneIndex() {
  return Math.floor(Math.random() * MISSION_EXPLORE_SCENES.length);
}

export function getMissionExploreScene(index) {
  const i = ((Number(index) || 0) % MISSION_EXPLORE_SCENES.length + MISSION_EXPLORE_SCENES.length) % MISSION_EXPLORE_SCENES.length;
  return MISSION_EXPLORE_SCENES[i];
}

export default function MissionExploreBackdrop({ missionName, sceneIndex }) {
  const scene = getMissionExploreScene(sceneIndex);

  return (
    <div className="relative h-full w-full min-h-0 rounded-2xl overflow-hidden border border-border/60 shadow-2xl painted-panel painted-frame">
      <motion.img
        key={scene.src}
        src={scene.src}
        alt=""
        initial={{ opacity: 0, scale: 1.03 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="absolute inset-0 w-full h-full object-cover object-center"
        draggable={false}
      />

      <div className="absolute inset-0 bg-gradient-to-t from-background/85 via-background/15 to-background/40 pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 70% 55% at 50% 45%, transparent 35%, hsl(232 32% 4% / 0.4) 100%)" }} />

      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-background/75 border border-border/50 backdrop-blur-sm">
        <p className="text-[10px] font-display tracking-[0.2em] uppercase text-primary/90 whitespace-nowrap">
          Exploring · {missionName || "Mission"}
        </p>
      </div>

      <div className="absolute bottom-4 left-4 right-4 z-10">
        <p className="text-sm sm:text-base font-display font-semibold text-foreground/95 drop-shadow-md max-w-xl">
          {scene.caption}
        </p>
      </div>
    </div>
  );
}

// Juicy, punchy motion presets matching the hand-painted neon MMO reference:
// overshoot springs, staggered reveals, idle floats, glow pulses, tactile presses.
export const juice = { type: "spring", stiffness: 420, damping: 14, mass: 0.6 };
export const juiceSoft = { type: "spring", stiffness: 260, damping: 20 };

export const popIn = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0, transition: juice },
  exit: { opacity: 0, y: -18, transition: juiceSoft },
};

export const staggerParent = {
  initial: {},
  animate: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
  exit: {},
};

export const staggerChild = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: juice },
  exit: { opacity: 0, transition: juiceSoft },
};

export const floaty = {
  animate: { y: [0, -7, 0] },
  transition: { duration: 3.2, repeat: Infinity, ease: "easeInOut" },
};

export const glowPulse = {
  animate: {
    boxShadow: [
      "0 0 0px hsl(190 90% 50% / 0)",
      "0 0 18px hsl(190 90% 50% / 0.4)",
      "0 0 0px hsl(190 90% 50% / 0)",
    ],
  },
  transition: { duration: 2.2, repeat: Infinity, ease: "easeInOut" },
};

export const btnPress = {
  whileHover: { y: -1 },
  whileTap: { y: 1 },
  transition: juice,
};
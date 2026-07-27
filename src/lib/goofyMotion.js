// Juicy, Shakes-&-Fidget-style spring presets for goofy pop across the app.
export const spring = { type: "spring", stiffness: 380, damping: 13, mass: 0.7 };
export const springSoft = { type: "spring", stiffness: 220, damping: 18 };
export const popIn = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 14 },
};
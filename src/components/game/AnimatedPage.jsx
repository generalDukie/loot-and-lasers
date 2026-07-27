import { motion } from "framer-motion";

// Minimal page-transition wrapper. Only a short opacity fade — no scale, no
// translate, no transform — so each page renders at full device-pixel
// resolution immediately and never looks blurry or fuzzy during navigation.
export default function AnimatedPage({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="flex-1 min-h-0 flex flex-col"
    >
      {children}
    </motion.div>
  );
}
import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

// Circular medallion for the Command Hub — no text; the gear spins on hover.
export default function CommandHubMedallion({ icon = "⚙️", color = "#8BE8FF", to = "/settings", delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, type: "spring", stiffness: 260, damping: 18 }}
    >
      <Link to={to} className="group flex items-center justify-center focus:outline-none" title="Command Hub">
        <motion.div
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.93 }}
          className="relative w-16 h-16 sm:w-20 sm:h-20 lg:w-28 lg:h-28 rounded-full flex items-center justify-center border-2 backdrop-blur-md"
          style={{
            borderColor: color,
            background: `radial-gradient(circle, ${color}22, hsl(232 30% 6% / 0.85))`,
            boxShadow: `0 0 24px ${color}44, inset 0 0 18px ${color}22`,
          }}
        >
          <div
            className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
            style={{ background: `radial-gradient(circle, ${color}33, transparent 70%)` }}
          />
          <span
            className="text-2xl sm:text-3xl lg:text-5xl group-hover:animate-spin"
            style={{ filter: `drop-shadow(0 0 6px ${color}66)` }}
          >
            {icon}
          </span>
        </motion.div>
      </Link>
    </motion.div>
  );
}
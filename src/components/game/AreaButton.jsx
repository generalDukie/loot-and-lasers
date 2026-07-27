import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { spring } from "@/lib/goofyMotion";

// A single polished, enticing navigation tile for the station hub.
export default function AreaButton({ icon, label, to, color, desc, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...spring, delay }}
    >
      <Link to={to} className="group block h-full focus:outline-none">
        <motion.div
          whileHover={{ y: -5, scale: 1.035 }}
          whileTap={{ scale: 0.96 }}
          transition={{ type: "spring", stiffness: 400, damping: 14 }}
          className="relative h-full rounded-2xl border bg-card/60 backdrop-blur-sm p-4 flex flex-col items-center text-center overflow-hidden canvas-grain transition-colors duration-300 group-hover:bg-card/80"
          style={{ borderColor: color + "55", boxShadow: `0 4px 14px hsl(232 40% 2% / 0.5)` }}
        >
          {/* Hover glow wash */}
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
            style={{ background: `radial-gradient(circle at 50% 0%, ${color}26, transparent 72%)` }}
          />
          {/* Icon medallion */}
          <div
            className="relative w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-2 border"
            style={{ borderColor: color + "44", background: color + "12", boxShadow: `0 0 12px ${color}33` }}
          >
            <motion.span
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", delay: delay * 2 }}
            >
              {icon}
            </motion.span>
          </div>
          <span className="relative font-display font-bold text-xs tracking-wide leading-tight" style={{ color }}>
            {label}
          </span>
          {desc && (
            <span className="relative text-[9px] text-muted-foreground mt-1 leading-tight line-clamp-2">{desc}</span>
          )}
          {/* Bottom accent line reveals on hover */}
          <div
            className="absolute bottom-0 left-0 right-0 h-0.5 origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300"
            style={{ background: color }}
          />
        </motion.div>
      </Link>
    </motion.div>
  );
}
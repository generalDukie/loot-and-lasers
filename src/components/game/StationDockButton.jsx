import React, { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

// Compact hub dock tile — equal-width, icon + label, optional hover destinations.
export default function StationDockButton({
  icon,
  label,
  color,
  to,
  options = [],
  delay = 0,
  featured = false,
}) {
  const [open, setOpen] = useState(false);
  const destinations = options.length ? options : to ? [{ label, icon, to, color }] : [];
  const primary = destinations[0];
  if (!primary) return null;

  const isSplit = destinations.length > 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: "spring", stiffness: 280, damping: 22 }}
      className="relative flex-1 min-w-0"
      onMouseEnter={() => isSplit && setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Link to={primary.to} className="group block focus:outline-none h-full">
        <motion.div
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.97 }}
          className={`relative h-full rounded-xl overflow-hidden border backdrop-blur-md transition-colors ${
            featured ? "border-2 py-2.5 sm:py-3 px-1.5" : "border py-2 sm:py-2.5 px-1"
          }`}
          style={{
            borderColor: featured ? color : `${color}66`,
            background: `linear-gradient(180deg, ${color}${featured ? "28" : "18"}, hsl(232 30% 6% / 0.9))`,
            boxShadow: featured
              ? `0 4px 18px hsl(232 40% 2% / 0.55), 0 0 16px ${color}33`
              : `0 3px 12px hsl(232 40% 2% / 0.45), 0 0 8px ${color}18`,
          }}
        >
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
            style={{ background: `radial-gradient(circle at 50% 0%, ${color}2a, transparent 70%)` }}
          />
          <div className="relative flex flex-col items-center justify-center gap-1 text-center">
            <span
              className={`leading-none ${featured ? "text-xl sm:text-2xl" : "text-lg sm:text-xl"}`}
              style={{ filter: `drop-shadow(0 0 6px ${color}55)` }}
            >
              {icon}
            </span>
            <p
              className={`font-display font-bold tracking-wide leading-tight line-clamp-2 ${
                featured ? "text-[10px] sm:text-xs" : "text-[9px] sm:text-[10px]"
              }`}
              style={{ color }}
            >
              {label}
            </p>
          </div>
        </motion.div>
      </Link>

      <AnimatePresence>
        {open && isSplit && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-[min(100%,11rem)] min-w-[8.5rem] rounded-lg overflow-hidden border backdrop-blur-md bg-background/95 shadow-xl"
            style={{ borderColor: `${color}44` }}
          >
            {destinations.map((opt) => (
              <Link
                key={opt.to}
                to={opt.to}
                className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted/60 transition-colors"
              >
                <span className="text-sm leading-none">{opt.icon}</span>
                <span
                  className="font-display font-semibold text-[11px] tracking-wide"
                  style={{ color: opt.color || color }}
                >
                  {opt.label}
                </span>
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

import React, { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

// Side button with a hover-revealed list of destination links.
export default function StationSplitButton({
  icon,
  label,
  color,
  desc,
  options = [],
  delay = 0,
  fromRight = false,
}) {
  const [open, setOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, x: fromRight ? 24 : -24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, type: "spring", stiffness: 280, damping: 22 }}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Link to={options[0]?.to} className="group block focus:outline-none">
        <motion.div
          whileHover={{ scale: 1.04, y: -3 }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: "spring", stiffness: 400, damping: 14 }}
          className="relative w-full rounded-xl overflow-hidden border-2 backdrop-blur-md transition-colors"
          style={{
            borderColor: color + "66",
            background: `linear-gradient(135deg, ${color}1f, hsl(232 30% 6% / 0.88))`,
            boxShadow: `0 4px 14px hsl(232 40% 2% / 0.5), 0 0 10px ${color}1a`,
          }}
        >
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
            style={{ background: `radial-gradient(circle at 50% 0%, ${color}2e, transparent 75%)` }}
          />
          <div className="relative flex items-center gap-2.5 p-2.5 lg:gap-4 lg:p-4">
            <div
              className="w-10 h-10 lg:w-14 lg:h-14 rounded-lg flex items-center justify-center text-xl lg:text-3xl shrink-0 border"
              style={{ borderColor: color + "44", background: color + "18", boxShadow: `0 0 10px ${color}33` }}
            >
              <motion.span
                animate={{ y: [0, -2, 0] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", delay: delay * 2 }}
              >
                {icon}
              </motion.span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display font-bold text-xs lg:text-base tracking-wide leading-tight" style={{ color }}>
                {label}
              </p>
              {desc && (
                <p className="text-[9px] lg:text-xs text-muted-foreground leading-tight mt-0.5 line-clamp-1">{desc}</p>
              )}
            </div>
          </div>
          <div
            className="absolute bottom-0 left-0 right-0 h-0.5 origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300"
            style={{ background: color }}
          />
        </motion.div>
      </Link>

      {/* Hover dropdown of destinations */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            className={`absolute z-50 bottom-full mb-1 ${fromRight ? "right-0" : "left-0"} w-full min-w-[150px] rounded-lg overflow-hidden border backdrop-blur-md bg-background/95 shadow-xl`}
            style={{ borderColor: color + "44" }}
          >
            {options.map((opt) => (
              <Link
                key={opt.to}
                to={opt.to}
                className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted/60 transition-colors"
              >
                <span className="text-base leading-none">{opt.icon}</span>
                <span className="font-display font-semibold text-[11px] tracking-wide" style={{ color: opt.color || color }}>
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
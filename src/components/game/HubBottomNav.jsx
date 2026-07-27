import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

// Horizontal scrolling strip of icon + label shortcuts.
export default function HubBottomNav({ items }) {
  return (
    <nav className="sticky bottom-0 z-40 border-t border-border/50 bg-background/90 backdrop-blur-xl">
      <div className="flex items-stretch gap-1 px-2 py-1.5 overflow-x-auto">
        {items.map((item, i) => (
          <motion.div
            key={item.to}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.03 * i }}
          >
            <Link
              to={item.to}
              className="group flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-lg hover:bg-muted/40 transition-colors min-w-[54px]"
            >
              <span className="text-lg leading-none" style={{ filter: `drop-shadow(0 0 4px ${item.color}55)` }}>
                {item.icon}
              </span>
              <span className="text-[9px] font-display font-medium text-muted-foreground group-hover:text-foreground transition-colors whitespace-nowrap">
                {item.label}
              </span>
            </Link>
          </motion.div>
        ))}
      </div>
    </nav>
  );
}
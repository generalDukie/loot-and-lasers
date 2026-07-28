import React from "react";
import { NavLink } from "react-router-dom";
import { NAV_GROUPS } from "@/lib/navGroups";

/**
 * Permanent left navigation rail for the game shell.
 * Uses existing NAV_GROUPS — does not change routes or page behavior.
 */
export default function ShellSidebar({ onNavigate, compact = false }) {
  return (
    <nav
      aria-label="Station navigation"
      className={`flex flex-col min-h-0 ${compact ? "gap-0.5 p-1.5" : "gap-1 p-2"}`}
    >
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-0.5 space-y-2">
        {NAV_GROUPS.map((g) => (
          <div key={g.name}>
            {!compact && (
              <span className="block text-[7px] font-display font-bold tracking-[0.18em] text-muted-foreground/45 px-2 mb-0.5">
                {g.name.toUpperCase()}
              </span>
            )}
            <div className="space-y-0.5">
              {g.items.map(({ to, label, icon: Icon, color }) => (
                <NavLink
                  key={to}
                  to={to}
                  title={label}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors border ${
                      isActive
                        ? "bg-primary/15 border-primary/35 text-foreground"
                        : "border-transparent text-muted-foreground hover:bg-muted/35 hover:text-foreground"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={`w-4 h-4 shrink-0 ${isActive ? "glow-cyan" : ""}`}
                        style={{ color }}
                      />
                      {!compact && (
                        <span className="font-display font-semibold text-[11px] tracking-wide truncate">
                          {label}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}

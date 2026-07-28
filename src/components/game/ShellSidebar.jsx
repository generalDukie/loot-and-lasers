import React from "react";
import { NavLink } from "react-router-dom";
import { NAV_GROUPS } from "@/lib/navGroups";

/**
 * Permanent left navigation rail for the game shell.
 * Fills remaining console height evenly — no scroll.
 */
export default function ShellSidebar({ onNavigate, compact = false }) {
  return (
    <nav
      aria-label="Station navigation"
      className="flex flex-col flex-1 min-h-0 overflow-hidden p-2"
    >
      <div className="flex flex-1 min-h-0 flex-col gap-0.5">
        {NAV_GROUPS.map((g) => (
          <div key={g.name} className="flex-1 min-h-0 flex flex-col">
            {!compact && (
              <span className="shrink-0 text-[6px] font-display font-bold tracking-[0.16em] text-muted-foreground/45 px-1.5 leading-none">
                {g.name.toUpperCase()}
              </span>
            )}
            <div className="flex-1 min-h-0 flex flex-col">
              {g.items.map(({ to, label, icon: Icon, color }) => (
                <NavLink
                  key={to}
                  to={to}
                  title={label}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `flex flex-1 min-h-0 items-center gap-2 rounded-md px-2 transition-colors border ${
                      isActive
                        ? "bg-primary/15 border-primary/35 text-foreground"
                        : "border-transparent text-muted-foreground hover:bg-muted/35 hover:text-foreground"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={`w-3.5 h-3.5 shrink-0 ${isActive ? "glow-cyan" : ""}`}
                        style={{ color }}
                      />
                      {!compact && (
                        <span className="font-display font-semibold text-[10px] sm:text-[11px] tracking-wide truncate leading-none">
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

import React from "react";
import { NavLink } from "react-router-dom";
import { NAV_GROUPS } from "@/lib/navGroups";

function hexToRgb(hex) {
  const raw = String(hex || "").trim().replace(/^#/, "");
  if (![3, 6].includes(raw.length)) return null;
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbaFromHex(hex, a) {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(34, 211, 238, ${a})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}

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
          <div
            key={g.name}
            className={`min-h-0 flex flex-col ${g.items.length >= 4 ? "flex-1" : "flex-[0.75]"}`}
          >
            {!compact && (
              <span className="shrink-0 text-[7px] font-display font-bold tracking-[0.18em] text-muted-foreground/45 px-1.5 leading-none">
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
                    `group flex flex-1 min-h-0 items-center gap-2.5 rounded-lg px-2.5 transition-colors border border-transparent ${
                      isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={`w-4 h-4 shrink-0 ${isActive ? "nav-icon-neon" : ""} group-hover:nav-icon-neon transition-[filter]`}
                        style={{
                          color,
                          "--nav-neon-soft": rgbaFromHex(color, 0.22),
                          "--nav-neon-strong": rgbaFromHex(color, 0.55),
                        }}
                      />
                      {!compact && (
                        <span
                          className={`font-display font-semibold text-[11px] sm:text-[12px] tracking-wide truncate leading-none ${
                            isActive ? "nav-neon-text" : "group-hover:nav-neon-text"
                          }`}
                          style={{
                            "--nav-neon-soft": rgbaFromHex(color, 0.22),
                            "--nav-neon-strong": rgbaFromHex(color, 0.55),
                          }}
                        >
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

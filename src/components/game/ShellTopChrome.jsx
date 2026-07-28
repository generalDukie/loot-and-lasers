import React from "react";
import { Link } from "react-router-dom";
import { Settings, Menu, PanelLeft } from "lucide-react";
import SiteTitle from "@/components/admin/SiteTitle";
import GameClock from "@/components/game/GameClock";
import ActivityCountdownChip from "@/components/game/ActivityCountdownChip";

/**
 * Slim persistent top chrome inside the game shell.
 * Secondary actions only — identity/nav live in the left rail.
 */
export default function ShellTopChrome({
  character,
  onToggleRail,
  railOpen,
}) {
  return (
    <header
      className="shrink-0 flex items-center gap-2 px-2.5 sm:px-3 py-1.5 border-b"
      style={{
        borderColor: "hsl(210 18% 22%)",
        background: "linear-gradient(180deg, hsl(220 18% 12% / 0.95), hsl(222 22% 7% / 0.9))",
        boxShadow: "inset 0 1px 0 hsl(0 0% 100% / 0.06)",
      }}
    >
      <button
        type="button"
        className="lg:hidden rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        onClick={onToggleRail}
        aria-expanded={railOpen}
        aria-label={railOpen ? "Close station panel" : "Open station panel"}
      >
        {railOpen ? <PanelLeft className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </button>

      <Link
        to="/"
        className="min-w-0 focus:outline-none group flex flex-col leading-none"
        title="Return to Hub"
      >
        <SiteTitle
          as="span"
          className="font-display font-black tracking-[0.14em] text-sm sm:text-base bg-gradient-to-r from-cyan-200 via-primary to-violet-400 bg-clip-text text-transparent group-hover:brightness-110 transition-[filter]"
        />
        <span className="text-[7px] font-display tracking-[0.2em] uppercase text-muted-foreground/70 mt-0.5 hidden sm:block">
          Station Hub
        </span>
      </Link>

      <div className="flex-1 min-w-0" />

      <ActivityCountdownChip character={character} />
      <div className="hidden md:block">
        <GameClock />
      </div>

      <IconLink to="/settings" title="Settings">
        <Settings className="w-4 h-4" />
      </IconLink>
    </header>
  );
}

function IconLink({ to, title, children }) {
  return (
    <Link
      to={to}
      title={title}
      className="relative rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
    >
      {children}
    </Link>
  );
}

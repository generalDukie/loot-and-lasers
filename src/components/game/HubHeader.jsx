import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, Users, Settings, MessageSquare, CornerUpLeft } from "lucide-react";
import CharacterNavMenu from "@/components/game/CharacterNavMenu";
import GameClock from "@/components/game/GameClock";
import SiteTitle from "@/components/admin/SiteTitle";
import { useUnreadMailCount } from "@/hooks/useUnreadMailCount";

// Shared station header — left nav, centered brand, right actions.
// Layout is flex/absolute-center only (no drag offsets) so it scales cleanly.
export default function HubHeader({ character, onOpenChat, rightExtras }) {
  const unreadMail = useUnreadMailCount(character?.id);
  return (
    <header className="sticky top-0 z-50 bg-background/80 border-b border-border/30 backdrop-blur-sm">
      <div className="relative flex items-center justify-between gap-2 px-3 py-2 max-w-[1920px] mx-auto w-full">
        <div className="min-w-0 shrink">
          <CharacterNavMenu character={character} large />
        </div>

        {/* Center brand */}
        <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none">
          <Link to="/" className="pointer-events-auto focus:outline-none flex flex-col items-center leading-none relative">
            <SiteTitle
              as="h1"
              className="font-display font-black text-lg sm:text-2xl md:text-3xl tracking-wider bg-gradient-to-r from-orange-400 via-amber-300 to-cyan-400 bg-clip-text text-transparent whitespace-nowrap"
            />
            <motion.div
              animate={{ rotate: [-38, -26, -38], scale: [1, 1.12, 1] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -right-8 sm:-right-10 top-0 text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.45)] flex flex-col items-center origin-top-right pointer-events-none"
            >
              <CornerUpLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="text-[7px] sm:text-[9px] font-display tracking-[0.2em] uppercase mt-0.5 whitespace-nowrap hidden xs:inline sm:inline text-white">
                Hub
              </span>
            </motion.div>
          </Link>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="hidden md:block mr-1">
            <GameClock />
          </div>
          {rightExtras}
          <Link to="/mail" className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors" title="Mail">
            <Mail className="w-4 h-4" />
            {unreadMail > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
                {unreadMail}
              </span>
            )}
          </Link>
          {onOpenChat && (
            <button onClick={onOpenChat} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors" title="Global Chat">
              <MessageSquare className="w-4 h-4" />
            </button>
          )}
          <Link to="/friends" className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors" title="Friends">
            <Users className="w-4 h-4" />
          </Link>
          <Link to="/settings" className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors" title="Settings">
            <Settings className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}

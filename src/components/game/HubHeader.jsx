import React from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, Users, Settings, MessageSquare, CornerUpLeft } from "lucide-react";
import CharacterNavMenu from "@/components/game/CharacterNavMenu";
import GameClock from "@/components/game/GameClock";
import SiteTitle from "@/components/admin/SiteTitle";
import ActivityCountdownChip from "@/components/game/ActivityCountdownChip";
import { useUnreadMailCount } from "@/hooks/useUnreadMailCount";

// Shared station header — 3-column grid so left / brand / right scale across
// resolutions (including ultrawide) without crushing the center.
export default function HubHeader({ character, onOpenChat, rightExtras }) {
  const unreadMail = useUnreadMailCount(character?.id);
  const { pathname } = useLocation();
  const onHub = pathname === "/";
  return (
    <header className="sticky top-0 z-50 bg-background/80 border-b border-border/30 backdrop-blur-sm shrink-0">
      <div
        className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3 w-full"
        style={{
          padding: "clamp(0.4rem, 0.7vw, 0.85rem) clamp(0.75rem, 1.8vw, 2rem)",
        }}
      >
        <div className="min-w-0 justify-self-start">
          <CharacterNavMenu character={character} large />
        </div>

        {/* Center brand */}
        <div className="justify-self-center flex flex-col items-center px-1">
          {onHub ? (
            <BrandMark />
          ) : (
            <Link to="/" className="pointer-events-auto focus:outline-none flex flex-col items-center leading-none relative group">
              <BrandMark interactive />
              <motion.div
                animate={{ rotate: [-38, -26, -38], scale: [1, 1.12, 1] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                className="absolute top-0 text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.45)] flex flex-col items-center origin-top-right pointer-events-none"
                style={{ right: "clamp(-2.4rem, -2.2vw, -1.6rem)" }}
              >
                <CornerUpLeft style={{ width: "clamp(0.85rem, 1.1vw, 1.15rem)", height: "clamp(0.85rem, 1.1vw, 1.15rem)" }} />
                <span
                  className="font-display tracking-[0.2em] uppercase mt-0.5 whitespace-nowrap text-white"
                  style={{ fontSize: "clamp(0.45rem, 0.65vw, 0.6rem)" }}
                >
                  Hub
                </span>
              </motion.div>
            </Link>
          )}
        </div>

        {/* Right actions */}
        <div
          className="justify-self-end flex items-center shrink-0"
          style={{ gap: "clamp(0.25rem, 0.6vw, 0.6rem)" }}
        >
          <ActivityCountdownChip character={character} />
          <div className="hidden md:block mr-1">
            <GameClock />
          </div>
          {rightExtras}
          <HeaderIconLink to="/mail" title="Mail">
            <Mail className="w-[1em] h-[1em]" />
            {unreadMail > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
                {unreadMail}
              </span>
            )}
          </HeaderIconLink>
          {onOpenChat && (
            <HeaderIconButton onClick={onOpenChat} title="Global Chat">
              <MessageSquare className="w-[1em] h-[1em]" />
            </HeaderIconButton>
          )}
          <HeaderIconLink to="/friends" title="Friends">
            <Users className="w-[1em] h-[1em]" />
          </HeaderIconLink>
          <HeaderIconLink to="/settings" title="Settings">
            <Settings className="w-[1em] h-[1em]" />
          </HeaderIconLink>
        </div>
      </div>
    </header>
  );
}

function BrandMark({ interactive = false }) {
  const size = { fontSize: "clamp(1.05rem, 2.1vw, 2.15rem)" };
  const base =
    "font-display font-black tracking-[0.14em] whitespace-nowrap leading-none";
  return (
    <div className={`relative inline-flex flex-col items-center leading-none ${interactive ? "group" : ""}`}>
      {/* Soft bloom behind the wordmark */}
      <span className="absolute inset-0 pointer-events-none select-none" aria-hidden>
        <SiteTitle
          as="span"
          className={`${base} block text-primary/70 blur-[7px] opacity-60 ${
            interactive ? "group-hover:opacity-80 transition-opacity" : ""
          }`}
          style={size}
        />
      </span>
      <SiteTitle
        as="h1"
        className={`${base} relative bg-gradient-to-r from-cyan-200 via-primary to-violet-400 bg-clip-text text-transparent ${
          interactive ? "group-hover:brightness-110 transition-[filter]" : ""
        }`}
        style={{
          ...size,
          filter: "drop-shadow(0 0 10px hsl(190 90% 50% / 0.35)) drop-shadow(0 0 18px hsl(270 60% 55% / 0.2))",
        }}
      />
      {/* Thin laser underline */}
      <span
        className="mt-1 h-px w-[72%] rounded-full bg-gradient-to-r from-transparent via-primary to-transparent opacity-70"
        style={{ boxShadow: "0 0 8px hsl(190 90% 50% / 0.55)" }}
        aria-hidden
      />
    </div>
  );
}

function HeaderIconLink({ to, title, children }) {
  return (
    <Link
      to={to}
      title={title}
      className="relative rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors flex items-center justify-center"
      style={{ padding: "clamp(0.4rem, 0.55vw, 0.6rem)", fontSize: "clamp(0.95rem, 1.15vw, 1.2rem)" }}
    >
      {children}
    </Link>
  );
}

function HeaderIconButton({ onClick, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="relative rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors flex items-center justify-center"
      style={{ padding: "clamp(0.4rem, 0.55vw, 0.6rem)", fontSize: "clamp(0.95rem, 1.15vw, 1.2rem)" }}
    >
      {children}
    </button>
  );
}

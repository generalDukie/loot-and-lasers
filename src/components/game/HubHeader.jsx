import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, Users, Settings, MessageSquare, CornerUpLeft } from "lucide-react";
import CharacterNavMenu from "@/components/game/CharacterNavMenu";
import GameClock from "@/components/game/GameClock";
import EditableText from "@/components/admin/EditableText";
import DraggableElement from "@/components/game/DraggableElement";
import { useUnreadMailCount } from "@/hooks/useUnreadMailCount";
import { useAuth } from "@/lib/AuthContext";
import { useSiteConfig } from "@/lib/SiteConfigContext";
import { useHubLayout } from "@/hooks/useHubLayout";

// Shared station header banner used on the hub and every game page.
// Left: character nav. Center: logo (link home) + clock. Right: actions.
export default function HubHeader({ character, onOpenChat, rightExtras }) {
  const unreadMail = useUnreadMailCount(character?.id);
  const { user } = useAuth();
  const { editMode } = useSiteConfig();
  const { positions, savePosition } = useHubLayout(user?.id);
  return (
    <header className="sticky top-0 z-50 bg-background/80 border-b border-border/30">
      <div className="relative flex items-center justify-between gap-2 px-3 py-2">
        <CharacterNavMenu character={character} large />

        {/* Center: logo (clickable → hub) + clock */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3 pointer-events-none">
          <div className="relative">
            <Link to="/" className="pointer-events-auto focus:outline-none flex flex-col items-center leading-none">
              <EditableText
                textKey="app.title"
                default="LOOT & LASERS"
                as="h1"
                className="font-display font-black text-xl sm:text-3xl tracking-wider bg-gradient-to-r from-orange-400 via-amber-300 to-cyan-400 bg-clip-text text-transparent whitespace-nowrap"
              />
            </Link>
            <div className={`absolute top-0 -right-1 sm:-right-2 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.4)] flex flex-col items-center origin-top-right ${editMode ? "pointer-events-auto" : "pointer-events-none"}`}>
              <DraggableElement id="return_to_hub" editMode={editMode} positions={positions} onSave={savePosition}>
                <motion.div
                  animate={{ rotate: [-38, -26, -38], scale: [1, 1.18, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                  className="flex flex-col items-center"
                >
                  <CornerUpLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="text-[8px] sm:text-[9px] font-display tracking-[0.25em] uppercase mt-0.5 whitespace-nowrap">Return to Hub</span>
                </motion.div>
              </DraggableElement>
            </div>
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:block mr-1">
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
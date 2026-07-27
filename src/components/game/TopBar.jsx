import React from "react";
import HubHeader from "@/components/game/HubHeader";

// Thin wrapper around the shared HubHeader for game (non-hub) pages.
export default function TopBar({ character, onOpenChat }) {
  return (
    <HubHeader
      character={character}
      onOpenChat={onOpenChat}
    />
  );
}

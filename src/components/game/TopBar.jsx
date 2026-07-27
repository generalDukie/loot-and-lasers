import React from "react";
import HubHeader from "@/components/game/HubHeader";
import AdminControls from "@/components/admin/AdminControls";

// Thin wrapper around the shared HubHeader for game (non-hub) pages,
// adding admin controls and the global-chat trigger.
export default function TopBar({ character, onOpenChat }) {
  return (
    <HubHeader
      character={character}
      onOpenChat={onOpenChat}
      rightExtras={<AdminControls />}
    />
  );
}
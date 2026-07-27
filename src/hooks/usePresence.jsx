import { useEffect, useRef } from "react";
import { api } from "@/api/gameClient";

// Heartbeat: marks the character online while the app is open.
// status: "online" by default; callers can pass "in_mission" to reflect active duty.
export function usePresence(character, status = "online") {
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    if (!character?.id) return;
    let active = true;

    async function ping() {
      if (!active) return;
      try {
        const existing = await api.entities.PlayerPresence.filter({ character_id: character.id });
        const now = new Date().toISOString();
        if (existing[0]) {
          await api.entities.PlayerPresence.update(existing[0].id, {
            status: statusRef.current, last_seen_at: now,
            character_name: character.name,
          });
        } else {
          await api.entities.PlayerPresence.create({
            character_id: character.id, character_name: character.name,
            status: statusRef.current, last_seen_at: now,
          });
        }
      } catch (_) { /* ignore */ }
    }

    ping();
    const t = setInterval(ping, 30000);
    return () => { active = false; clearInterval(t); };
  }, [character?.id]);
}

// Determine display status from a presence record (online if seen < 90s ago).
export function presenceStatus(presence) {
  if (!presence) return "offline";
  const age = Date.now() - new Date(presence.last_seen_at).getTime();
  if (age > 90000) return "offline";
  return presence.status === "in_mission" ? "in_mission" : "online";
}
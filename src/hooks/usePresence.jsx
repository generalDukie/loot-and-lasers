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
        await api.functions.invoke("SetPresence", { status: statusRef.current });
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
  if (typeof presence.online === "boolean") return presence.online ? (presence.status || "online") : "offline";
  if (!presence.last_seen_at) return "offline";
  return Date.now() - new Date(presence.last_seen_at).getTime() < 90000
    ? (presence.status || "online")
    : "offline";
}

import React, { useEffect, useState } from "react";

/**
 * Lightweight connectivity chrome (presentation only).
 * Does not alter auth/networking — observes browser online state + optional API probe age.
 */
export default function ConnectivityBanner() {
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    const on = () => {
      setOnline(true);
      setReconnecting(false);
    };
    const off = () => {
      setOnline(false);
      setReconnecting(false);
    };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (online) return undefined;
    const t = setTimeout(() => setReconnecting(true), 2500);
    return () => clearTimeout(t);
  }, [online]);

  if (online) return null;

  return (
    <div
      role="status"
      className="absolute top-0 inset-x-0 z-[80] px-3 py-1.5 text-center text-[11px] font-display font-bold tracking-wide border-b"
      style={{
        background: "linear-gradient(90deg, rgba(127,29,29,0.92), rgba(69,10,10,0.92))",
        borderColor: "rgba(248,113,113,0.45)",
        color: "#FECACA",
      }}
    >
      {reconnecting
        ? "Connection lost — waiting to reconnect…"
        : "You are offline. Gameplay actions may fail until connectivity returns."}
    </div>
  );
}

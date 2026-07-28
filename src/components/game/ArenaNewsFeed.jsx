import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/api/gameClient";
import { Newspaper } from "lucide-react";

const NEWS_TTL_MS = 24 * 60 * 60 * 1000;

function eventTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isFresh(entry, now = Date.now()) {
  const t = new Date(entry?.created_date).getTime();
  if (Number.isNaN(t)) return false;
  return now - t < NEWS_TTL_MS;
}

export default function ArenaNewsFeed({ compact = false }) {
  const [news, setNews] = useState([]);

  const load = useCallback(async () => {
    try {
      const cutoff = new Date(Date.now() - NEWS_TTL_MS).toISOString();
      try {
        await api.entities.GalaxyNews.deleteMany({ created_date: { $lt: cutoff } });
      } catch { /* best-effort purge */ }

      const n = await api.entities.GalaxyNews.list("-created_date", 40);
      setNews((n || []).filter((entry) => isFresh(entry)));
    } catch { /* galaxy can stay quiet */ }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const visible = compact ? news.slice(0, 3) : news;

  return (
    <div className="relative overflow-hidden rounded-xl border border-border/60 painted-panel painted-frame canvas-grain">
      <div className="absolute inset-0 pointer-events-none opacity-60" style={{
        background: "radial-gradient(ellipse 70% 50% at 0% 0%, rgba(34,211,238,0.1), transparent 55%)",
      }} />
      <div className={`relative ${compact ? "p-2.5" : "p-4"}`}>
        <h3 className={`font-display font-bold tracking-[0.18em] flex items-center gap-2 text-cyan-300/90 ${compact ? "text-[10px] mb-1.5" : "text-xs mb-3"}`}>
          <Newspaper className="w-3.5 h-3.5" /> GALAXY NEWS
        </h3>
        <div className={`space-y-1.5 ${compact ? "" : "max-h-56 overflow-y-auto pr-1"}`}>
          {visible.length === 0 && (
            <p className="text-[11px] text-muted-foreground italic">The galaxy is quiet... for now.</p>
          )}
          <AnimatePresence>
            {visible.map((n) => (
              <motion.div
                key={n.id}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className={`rounded-lg border border-border/40 bg-background/30 text-[11px] text-foreground/85 leading-snug ${compact ? "px-2 py-1.5" : "px-2.5 py-2"}`}
              >
                {!compact && (
                  <span className="text-muted-foreground font-display text-[10px] tracking-wide">
                    {eventTime(n.created_date)}
                  </span>
                )}
                <p className={compact ? "" : "mt-0.5"}>{n.message}</p>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

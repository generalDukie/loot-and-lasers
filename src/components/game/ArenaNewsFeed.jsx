import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/api/gameClient";
import { Newspaper } from "lucide-react";

const NEWS_TTL_MS = 24 * 60 * 60 * 1000; // keep events for 24 hours

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

export default function ArenaNewsFeed() {
  const [news, setNews] = useState([]);

  const load = useCallback(async () => {
    try {
      // Drop anything older than 24h so wiped/stale events don't linger in the DB.
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

  return (
    <div className="p-3 rounded-xl border border-border/50 bg-card/40">
      <h3 className="font-display font-bold text-xs tracking-wide flex items-center gap-1 mb-2">
        <Newspaper className="w-3.5 h-3.5 text-primary" /> GALAXY NEWS
      </h3>
      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
        {news.length === 0 && <p className="text-[11px] text-muted-foreground">The galaxy is quiet... for now.</p>}
        <AnimatePresence>
          {news.map((n) => (
            <motion.div
              key={n.id}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="text-[11px] text-foreground/80 leading-snug"
            >
              <span className="text-muted-foreground">{eventTime(n.created_date)}</span>
              {" — "}
              {n.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

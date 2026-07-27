import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/api/gameClient";
import { Newspaper } from "lucide-react";

const NEWS_TTL_SEC = 500;

function timeAgo(iso, now) {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function ArenaNewsFeed() {
  const [news, setNews] = useState([]);
  const [now, setNow] = useState(Date.now());

  const load = async () => {
    try {
      const n = await api.entities.GalaxyNews.list("-created_date", 20);
      setNews(n || []);
    } catch { /* galaxy can stay quiet */ }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);

  // Tick every second so the "Xs ago" counter counts up live, and
  // entries auto-expire once they pass the TTL.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const visible = news.filter(
    (n) => (now - new Date(n.created_date).getTime()) / 1000 < NEWS_TTL_SEC
  );

  return (
    <div className="p-3 rounded-xl border border-border/50 bg-card/40">
      <h3 className="font-display font-bold text-xs tracking-wide flex items-center gap-1 mb-2">
        <Newspaper className="w-3.5 h-3.5 text-primary" /> GALAXY NEWS
      </h3>
      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
        {visible.length === 0 && <p className="text-[11px] text-muted-foreground">The galaxy is quiet... for now.</p>}
        <AnimatePresence>
          {visible.map((n) => (
            <motion.div key={n.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }} className="text-[11px] text-foreground/80 leading-snug">
              <span className="text-muted-foreground">{timeAgo(n.created_date, now)}</span> — {n.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
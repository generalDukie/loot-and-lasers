import React, { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, CheckCheck, Calendar, X, Star } from "lucide-react";
import { api } from "@/api/gameClient";
import { getUnreadCounts, subscribeNotifications, subscribeLocalAlerts, markRead, syncStatPointsNotification } from "@/lib/notificationEngine";
import { canClaimToday, getProgress } from "@/lib/dailyLoginEngine";
import { TYPE_META, timeAgo } from "@/components/social/NotificationsTab";
import NotificationActions from "@/components/social/NotificationActions";

// Floating, minimizable personal-notification tab pinned to the bottom-right.
// Replaces the old TopBar bell dropdown so all push alerts live in one place.
export default function NotificationCenter({ myChar, onOpenDaily }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({ total: 0 });
  const [dailyAvailable, setDailyAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pulse, setPulse] = useState(false);
  const loadingRef = useRef(false);
  const syncingRef = useRef(false);
  const prevUnreadRef = useRef(0);

  const unspent = myChar?.unspent_stat_points || 0;

  const load = useCallback(async () => {
    if (!myChar || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const [all, c, prog] = await Promise.all([
        api.entities.AppNotification.filter({ owner_id: myChar.id }, "-created_date", 50),
        getUnreadCounts(myChar.id),
        getProgress(myChar.id),
      ]);
      setItems(all || []);
      setCounts(c);
      setDailyAvailable(canClaimToday(prog));
    } catch (e) {
      // Rate limit / network blips shouldn't crash the panel — keep stale data.
      console.warn("NotificationCenter load failed", e?.message || e);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [myChar]);

  // Persist an unread attribute-points notification while points remain.
  useEffect(() => {
    if (!myChar?.id) return;
    let cancelled = false;
    (async () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      try {
        await syncStatPointsNotification(myChar);
        if (!cancelled) load();
      } finally {
        syncingRef.current = false;
      }
    })();
    return () => { cancelled = true; };
  }, [myChar?.id, unspent, load, myChar]);

  useEffect(() => {
    if (!myChar) return;
    setLoading(true);
    load();
    // Debounce realtime reloads — fast enough that toast→bell feedback feels
    // instant, slow enough that a burst doesn't hammer the API.
    let pending = null;
    const schedule = () => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        load();
      }, 400);
    };
    const unsub = subscribeNotifications(myChar.id, schedule);
    const unsubLocal = subscribeLocalAlerts(() => {
      setPulse(true);
      setTimeout(() => setPulse(false), 900);
      // Bump badge immediately; full list refresh follows via schedule/load.
      setCounts((c) => ({ ...c, total: (c.total || 0) + 1 }));
      schedule();
    });
    return () => {
      unsub?.();
      unsubLocal?.();
      if (pending) clearTimeout(pending);
    };
  }, [load, myChar]);

  // Pulse the bell when unread count rises (new toast / push landed).
  useEffect(() => {
    const next = counts.total || 0;
    if (next > prevUnreadRef.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 900);
      prevUnreadRef.current = next;
      return () => clearTimeout(t);
    }
    prevUnreadRef.current = next;
  }, [counts.total]);

  // Auto-close the panel after 30 seconds so it doesn't linger on screen.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => setOpen(false), 30000);
    return () => clearTimeout(timer);
  }, [open]);

  async function handleMarkRead(item) {
    if (item.read) return;
    // Attribute-points alerts stay until the points are actually spent.
    if (item.type === "stat_points" && unspent > 0) return;
    await markRead(item.id);
    setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
    setCounts((c) => ({ ...c, total: Math.max(0, (c.total || 0) - 1) }));
  }

  async function handleMarkAllRead() {
    if (!myChar) return;
    await api.entities.AppNotification.updateMany(
      { owner_id: myChar.id, read: false },
      { $set: { read: true } }
    );
    // Re-assert the attribute-points alert if points are still available.
    await syncStatPointsNotification(myChar);
    await load();
  }

  const unread = counts.total || 0;
  const hasStatPoints = unspent > 0;
  const total = unread + (dailyAvailable ? 1 : 0);

  return (
    <div className="fixed bottom-4 right-3 sm:right-4 z-[60] flex flex-col items-end gap-2">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="w-[min(22rem,calc(100vw-1.5rem))] max-h-[65vh] flex flex-col rounded-2xl border border-border/60 bg-card/95 backdrop-blur-md shadow-2xl painted-panel overflow-hidden"
          >
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/30 bg-muted/20 shrink-0">
              <h3 className="text-xs font-display font-semibold tracking-wide text-muted-foreground uppercase flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5 text-primary" /> Notifications
                {unread > 0 && <span className="text-destructive normal-case">· {unread} new</span>}
              </h3>
              <button
                onClick={handleMarkAllRead}
                disabled={unread === 0}
                className="p-1 rounded-md text-primary hover:bg-muted/40 disabled:opacity-30 transition-colors"
                title="Mark all read"
              >
                <CheckCheck className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-y-auto p-2.5 flex-1">
              {hasStatPoints && (
                <Link
                  to="/character"
                  onClick={() => setOpen(false)}
                  className="w-full flex items-center gap-2.5 p-2.5 mb-2 rounded-xl bg-cyan-500/10 border border-cyan-400/40 hover:bg-cyan-500/20 transition-colors text-left"
                >
                  <Star className="w-4 h-4 text-cyan-300 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-display font-semibold text-cyan-200">
                      {unspent} Attribute Point{unspent === 1 ? "" : "s"} Available
                    </p>
                    <p className="text-[10px] text-muted-foreground">Tap to open Hero and allocate</p>
                  </div>
                </Link>
              )}

              {dailyAvailable && (
                <button
                  onClick={() => { onOpenDaily?.(); setOpen(false); }}
                  className="w-full flex items-center gap-2.5 p-2.5 mb-2 rounded-xl bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition-colors text-left"
                >
                  <Calendar className="w-4 h-4 text-amber-300 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-display font-semibold text-amber-200">Daily Reward Ready</p>
                    <p className="text-[10px] text-muted-foreground">Claim your login reward</p>
                  </div>
                </button>
              )}

              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" />
                </div>
              ) : items.length === 0 && !dailyAvailable && !hasStatPoints ? (
                <div className="text-center py-8">
                  <Bell className="w-7 h-7 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-xs text-muted-foreground">No notifications yet.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {items.map((n) => {
                    const meta = TYPE_META[n.type] || TYPE_META.system;
                    const Icon = meta.icon;
                    const stickyPoints = n.type === "stat_points" && unspent > 0;
                    return (
                      <div
                        key={n.id}
                        onClick={() => handleMarkRead(n)}
                        className={`w-full flex items-start gap-2.5 p-2 rounded-xl border text-left transition-colors ${
                          n.read && !stickyPoints ? "bg-card/20 border-border/20 opacity-60" : "bg-card/50 border-border/40 hover:bg-card/70"
                        }`}
                      >
                        <div className="mt-0.5 shrink-0 w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: meta.color + "18" }}>
                          <Icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-display font-semibold truncate">{n.title || meta.label}</p>
                            <span className="text-[9px] text-muted-foreground shrink-0">{timeAgo(n.created_date)}</span>
                          </div>
                          {n.body && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                          {stickyPoints && (
                            <Link
                              to="/character"
                              onClick={(e) => { e.stopPropagation(); setOpen(false); }}
                              className="inline-block mt-1.5 text-[10px] font-display font-semibold text-cyan-300 hover:text-cyan-200"
                            >
                              Open Hero →
                            </Link>
                          )}
                          <NotificationActions
                            notification={n}
                            myChar={myChar}
                            onResolved={(rid) => {
                              setItems((prev) => prev.filter((x) => x.id !== rid));
                              setCounts((c) => ({ ...c, total: Math.max(0, (c.total || 0) - 1) }));
                            }}
                          />
                        </div>
                        {(!n.read || stickyPoints) && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileTap={{ scale: 0.9 }}
        animate={pulse ? { scale: [1, 1.12, 1] } : { scale: 1 }}
        transition={{ duration: 0.45 }}
        onClick={() => setOpen((o) => !o)}
        className="relative w-12 h-12 rounded-full bg-primary/15 border border-primary/40 text-primary flex items-center justify-center shadow-lg hover:bg-primary/25 transition-colors border-glow-cyan"
        title={open ? "Minimize notifications" : "Open notifications"}
        aria-label="Toggle notifications"
      >
        {open ? <X className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
        {!open && total > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-[10px] font-bold flex items-center justify-center text-white neon-badge">
            {total > 9 ? "9+" : total}
          </span>
        )}
      </motion.button>
    </div>
  );
}

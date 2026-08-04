import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { markRead, markAllRead, listNotifications, subscribeNotifications } from "@/lib/notificationEngine";
import { Bell, Users, MessageSquare, Mail, Gift, CheckCheck, Star } from "lucide-react";
import NotificationActions from "@/components/social/NotificationActions";

export const TYPE_META = {
  friend_request: { label: "Friend Request", icon: Users, color: "#A855F7" },
  private_message: { label: "Message", icon: MessageSquare, color: "#22D3EE" },
  mail: { label: "Mail", icon: Mail, color: "#F59E0B" },
  chat_mention: { label: "Mention", icon: Bell, color: "#34D399" },
  daily: { label: "Daily Reward", icon: Gift, color: "#FFD700" },
  system: { label: "System", icon: Bell, color: "#FB7185" },
  stat_points: { label: "Attribute Points", icon: Star, color: "#22D3EE" },
  achievement: { label: "Achievement", icon: Star, color: "#FFD700" },
  arena_defense: { label: "Arena Defense", icon: Bell, color: "#EF4444" },
  arena: { label: "Arena", icon: Bell, color: "#F97316" },
  mining: { label: "Mining", icon: Gift, color: "#A3E635" },
  mission: { label: "Mission", icon: Bell, color: "#38BDF8" },
  dungeon: { label: "Dungeon", icon: Bell, color: "#A855F7" },
};

export function timeAgo(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr).getTime();
  const mins = Math.floor((Date.now() - d) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationsTab({ myChar }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const all = await listNotifications({ limit: 50 });
    setItems(all || []);
    setLoading(false);
  }, [myChar]);

  useEffect(() => {
    load();
    const unsub = subscribeNotifications(myChar.id, () => load());
    return () => unsub?.();
  }, [load]);

  async function handleMarkRead(item) {
    if (item.read) return;
    await markRead(item.id);
    setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
  }

  async function handleMarkAllRead() {
    await markAllRead();
    await load();
  }

  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-sm tracking-wide text-muted-foreground">
          NOTIFICATIONS {unread > 0 && <span className="text-destructive">· {unread} new</span>}
        </h2>
        {unread > 0 && (
          <button onClick={handleMarkAllRead} className="text-xs flex items-center gap-1 text-primary hover:text-primary/80">
            <CheckCheck className="w-3.5 h-3.5" /> Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-7 h-7 border-4 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-card/50 border border-border/50 rounded-2xl p-10 text-center painted-panel canvas-grain">
          <Bell className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">No notifications yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const meta = TYPE_META[n.type] || TYPE_META.system;
            const Icon = meta.icon;
            return (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => handleMarkRead(n)}
                className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-colors ${
                  n.read ? "bg-card/30 border-border/30 opacity-60" : "bg-card/60 border-border/50 hover:bg-card/80"
                }`}
              >
                <div className="mt-0.5 shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: meta.color + "18" }}>
                  <Icon className="w-4 h-4" style={{ color: meta.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-display font-semibold truncate">{n.title || meta.label}</p>
                    <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(n.created_date)}</span>
                  </div>
                  {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                  <NotificationActions
                    notification={n}
                    myChar={myChar}
                    onResolved={(rid) => setItems((prev) => prev.filter((x) => x.id !== rid))}
                  />
                </div>
                {!n.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
import React, { useState } from "react";
import { api } from "@/api/gameClient";
import { acceptRequest, declineRequest } from "@/lib/socialEngine";
import { markRead } from "@/lib/notificationEngine";
import { useToast } from "@/components/ui/use-toast";
import { Check, X } from "lucide-react";

// Inline Accept/Decline controls rendered inside a notification that requires
// a decision. Currently backs friend_request notifications, whose `related_id`
// points at the FriendRequest record to accept or decline.
export default function NotificationActions({ notification, myChar, onResolved }) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  if (!notification) return null;
  if (notification.type !== "friend_request" || !notification.related_id) return null;

  async function resolve(kind) {
    if (busy || !myChar) return;
    setBusy(true);
    try {
      const req = await api.entities.FriendRequest.get(notification.related_id);
      if (!req) throw new Error("Request not found.");
      if (req.status && req.status !== "pending") {
        toast({ title: "Already resolved", description: "This friend request is no longer pending." });
      } else if (kind === "accept") {
        await acceptRequest(req, myChar);
        toast({ title: "Friend added", description: `${req.from_name || "Player"} is now your friend.` });
      } else {
        await declineRequest(req);
        toast({ title: "Request declined" });
      }
      // Mark read via Node RPC (entity CRUD updates are locked).
      await markRead(notification.id);
      onResolved?.(notification.id);
    } catch (e) {
      toast({ title: "Couldn't update request", description: e?.message || String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5 mt-1.5" onClick={(e) => e.stopPropagation()}>
      <button
        disabled={busy}
        onClick={() => resolve("accept")}
        className="text-[10px] px-2 py-1 rounded-md bg-green-500/15 text-green-300 border border-green-500/30 hover:bg-green-500/25 disabled:opacity-40 font-semibold transition-colors flex items-center gap-1"
      >
        <Check className="w-3 h-3" /> Accept
      </button>
      <button
        disabled={busy}
        onClick={() => resolve("decline")}
        className="text-[10px] px-2 py-1 rounded-md bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25 disabled:opacity-40 font-semibold transition-colors flex items-center gap-1"
      >
        <X className="w-3 h-3" /> Decline
      </button>
    </div>
  );
}
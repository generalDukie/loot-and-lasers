import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Send, ArrowLeft, MessagesSquare } from "lucide-react";
import { api } from "@/api/gameClient";
import { getConversations, getMessages, subscribePrivate, subscribeConversations, sendPrivate, markConversationRead } from "@/lib/chatEngine";
import { getCharacterById, getCharactersByIds } from "@/lib/socialEngine";
import { presenceStatus } from "@/hooks/usePresence";
import { useToast } from "@/components/ui/use-toast";
import ChatMessageItem from "@/components/social/ChatMessageItem";

export default function PrivateChatPanel({ myChar, initialRecipientId, onTagSender }) {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [other, setOther] = useState(null);
  const [presence, setPresence] = useState(null);
  const [names, setNames] = useState({});
  const scrollRef = useRef(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const loadConversations = useCallback(() => {
    if (!myChar) return;
    getConversations(myChar.id).then(async (convs) => {
      setConversations(convs);
      const otherIds = convs.map((c) => (c.participant_ids || []).find((id) => id !== myChar.id)).filter(Boolean);
      const chars = await getCharactersByIds(otherIds);
      const map = {};
      chars.forEach((c) => { map[c.id] = c; });
      setNames(map);
    });
  }, [myChar]);

  useEffect(() => { loadConversations(); }, [loadConversations]);
  useEffect(() => {
    const unsub = subscribeConversations(() => loadConversations());
    return () => unsub?.();
  }, [loadConversations]);

  // Start a conversation with initialRecipient
  useEffect(() => {
    if (!initialRecipientId || !myChar) return;
    getCharacterById(initialRecipientId).then((c) => {
      if (c) { setOther(c); setActiveId(null); }
    });
  }, [initialRecipientId, myChar]);

  const openConversation = useCallback(async (conv) => {
    const otherId = (conv.participant_ids || []).find((id) => id !== myChar.id);
    const o = await getCharacterById(otherId);
    setOther(o);
    setActiveId(conv.id);
    setMessages([]);
    const msgs = await getMessages(conv.id);
    setMessages(msgs.reverse());
    await markConversationRead(conv.id, myChar.id);
    setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, 50);
  }, [myChar]);

  useEffect(() => {
    if (!activeId) return;
    const unsub = subscribePrivate(activeId, (event) => {
      if (event.type === "create") {
        setMessages((prev) => prev.some((m) => m.id === event.data.id) ? prev : [...prev, event.data]);
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        if (event.data.recipient_id === myChar.id) markConversationRead(activeId, myChar.id);
      }
    });
    return () => unsub?.();
  }, [activeId, myChar]);

  // presence of other
  useEffect(() => {
    if (!other) return;
    api.entities.PlayerPresence.filter({ character_id: other.id }).then((p) => setPresence(p[0] || null));
    const t = setInterval(() => {
      api.entities.PlayerPresence.filter({ character_id: other.id }).then((p) => setPresence(p[0] || null));
    }, 20000);
    return () => clearInterval(t);
  }, [other]);

  async function send() {
    const content = input.trim();
    if (!content || sending || !other) return;
    setSending(true);
    setInput("");
    try {
      const res = await sendPrivate(other.id, content);
      if (res.conversation_id && !activeId) { setActiveId(res.conversation_id); loadConversations(); }
      setMessages((prev) => prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]);
      setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, 50);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || "Failed to send";
      toast({ title: "Message", description: msg, variant: "destructive" });
      setInput(content);
    } finally {
      setSending(false);
    }
  }

  const status = presenceStatus(presence);
  const statusColor = status === "online" ? "#34D399" : status === "in_mission" ? "#FBBF24" : "#6B7280";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MessagesSquare className="w-5 h-5 text-primary" />
        <h1 className="font-display font-bold text-xl tracking-wider">Messages</h1>
      </div>

      <div className="grid sm:grid-cols-[280px_1fr] gap-3 h-[70vh]">
        {/* Conversation list */}
        <div className={`rounded-xl border border-border/40 bg-card/40 overflow-y-auto ${activeId || other ? "hidden sm:block" : ""}`}>
          <p className="px-3 py-2 text-[10px] font-display tracking-wide text-muted-foreground uppercase border-b border-border/20">Conversations</p>
          {conversations.length === 0 && <p className="text-center text-xs text-muted-foreground py-6 italic">No conversations yet.</p>}
          {conversations.map((c) => {
            const oid = (c.participant_ids || []).find((id) => id !== myChar.id);
            const oName = names[oid]?.name || "Pilot";
            return (
              <button key={c.id} onClick={() => openConversation(c)}
                className={`w-full text-left px-3 py-2 border-b border-border/10 hover:bg-muted/20 ${activeId === c.id ? "bg-primary/10" : ""}`}>
                <p className="text-sm font-display font-semibold truncate">{oName}</p>
                <p className="text-[10px] text-muted-foreground truncate">{c.last_message_preview || ""}</p>
              </button>
            );
          })}
        </div>

        {/* Thread */}
        <div className={`rounded-xl border border-border/40 bg-card/40 flex flex-col ${(!activeId && !other) ? "hidden sm:flex" : ""}`}>
          {other ? (
            <>
              <div className="flex items-center gap-2 p-2 border-b border-border/20">
                <button onClick={() => { setActiveId(null); setOther(null); }} className="sm:hidden text-muted-foreground"><ArrowLeft className="w-4 h-4" /></button>
                <div className="w-7 h-7 rounded-full bg-muted/40 border border-border/40 flex items-center justify-center text-xs font-bold" style={{ color: "#2DD4BF" }}>
                  {(other.name)[0]?.toUpperCase()}
                  <span className="absolute -bottom-0 -right-0 w-2.5 h-2.5 rounded-full border-2 border-card" style={{ background: statusColor }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display font-semibold text-sm truncate">{other.name}</p>
                  <p className="text-[10px]" style={{ color: statusColor }}>{status === "online" ? "Online" : status === "in_mission" ? "In Mission" : "Offline"}</p>
                </div>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
                {messages.map((m) => (
                  <ChatMessageItem key={m.id} msg={{ ...m, sender_name: m.sender_id === myChar.id ? myChar.name : other.name, sender_level: other.level, sender_guild_tag: "" }} isMine={m.sender_id === myChar.id} onTagSender={onTagSender} showAvatar={false} />
                ))}
              </div>

              <div className="p-2 border-t border-border/20 flex items-center gap-2">
                <input value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(); } }}
                  maxLength={500} placeholder="Send a private message..."
                  className="flex-1 bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <button onClick={send} disabled={sending || !input.trim()} className="p-2 rounded-lg painted-btn disabled:opacity-40">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground italic">
              Select a conversation to start chatting.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
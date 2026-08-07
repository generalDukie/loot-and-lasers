import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, MessagesSquare, Radio, Users } from "lucide-react";
import { api } from "@/api/gameClient";
import {
  getConversations,
  getMessages,
  subscribePrivate,
  subscribeConversations,
  sendPrivate,
  markConversationRead,
} from "@/lib/chatEngine";
import { getCharacterById, getCharactersByIds } from "@/lib/socialEngine";
import { presenceStatus } from "@/hooks/usePresence";
import { useToast } from "@/components/ui/use-toast";
import ChatMessageItem from "@/components/social/ChatMessageItem";
import ChatComposeBar from "@/components/social/ChatComposeBar";

export default function PrivateChatPanel({ myChar, initialRecipientId, onTagSender, embedded = false }) {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [other, setOther] = useState(null);
  const [presence, setPresence] = useState(null);
  const [names, setNames] = useState({});
  const scrollRef = useRef(null);
  const { toast } = useToast();

  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const loadConversations = useCallback(() => {
    if (!myChar) return;
    getConversations(myChar.id).then(async (convs) => {
      setConversations(convs);
      const otherIds = convs
        .map((c) => (c.participant_ids || []).find((id) => id !== myChar.id))
        .filter(Boolean);
      const chars = await getCharactersByIds(otherIds);
      const map = {};
      chars.forEach((c) => {
        map[c.id] = c;
      });
      setNames(map);
    });
  }, [myChar]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    const unsub = subscribeConversations(() => loadConversations());
    return () => unsub?.();
  }, [loadConversations]);

  useEffect(() => {
    if (!initialRecipientId || !myChar) return;
    getCharacterById(initialRecipientId).then((c) => {
      if (c) {
        setOther(c);
        setActiveId(null);
      }
    });
  }, [initialRecipientId, myChar]);

  const openConversation = useCallback(
    async (conv) => {
      const otherId = (conv.participant_ids || []).find((id) => id !== myChar.id);
      const o = await getCharacterById(otherId);
      setOther(o);
      setActiveId(conv.id);
      setMessages([]);
      const msgs = await getMessages(conv.id);
      setMessages(msgs.reverse());
      await markConversationRead(conv.id, myChar.id);
      setTimeout(() => scrollToBottom(false), 50);
    },
    [myChar, scrollToBottom]
  );

  useEffect(() => {
    if (!activeId) return;
    const unsub = subscribePrivate(activeId, (event) => {
      if (event.type === "create") {
        setMessages((prev) =>
          prev.some((m) => m.id === event.data.id) ? prev : [...prev, event.data]
        );
        setTimeout(() => scrollToBottom(true), 40);
        if (event.data.recipient_id === myChar.id) markConversationRead(activeId, myChar.id);
      }
    });
    return () => unsub?.();
  }, [activeId, myChar, scrollToBottom]);

  useEffect(() => {
    if (!other) return;
    api.entities.PlayerPresence.filter({ character_id: other.id }).then((p) =>
      setPresence(p[0] || null)
    );
    const t = setInterval(() => {
      api.entities.PlayerPresence.filter({ character_id: other.id }).then((p) =>
        setPresence(p[0] || null)
      );
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
      if (res.conversation_id && !activeId) {
        setActiveId(res.conversation_id);
        loadConversations();
      }
      setMessages((prev) =>
        prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]
      );
      setTimeout(() => scrollToBottom(true), 40);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || "Failed to send";
      toast({ title: "Message", description: msg, variant: "destructive" });
      setInput(content);
    } finally {
      setSending(false);
    }
  }

  const status = presenceStatus(presence);
  const statusColor =
    status === "online" ? "#34D399" : status === "in_mission" ? "#FBBF24" : "#6B7280";
  const statusLabel =
    status === "online" ? "Online" : status === "in_mission" ? "In Mission" : "Offline";

  const panelStyle = {
    borderColor: "hsl(190 40% 40% / 0.28)",
    background: `
      linear-gradient(165deg, hsl(222 26% 11% / 0.92), hsl(230 30% 7% / 0.96)),
      repeating-linear-gradient(0deg, transparent, transparent 11px, hsl(190 40% 50% / 0.02) 11px, hsl(190 40% 50% / 0.02) 12px)
    `,
    boxShadow: "0 12px 32px rgba(0,0,0,0.22), inset 0 1px 0 hsl(190 60% 60% / 0.06)",
  };

  return (
    <div className={`flex flex-col flex-1 min-h-0 ${embedded ? "" : "space-y-4"}`}>
      {!embedded && (
        <div className="flex items-center gap-2">
          <MessagesSquare className="w-5 h-5 text-primary" />
          <h1 className="font-display font-bold text-xl tracking-wider">Messages</h1>
        </div>
      )}

      <div
        className="grid sm:grid-cols-[minmax(240px,300px)_1fr] gap-3 flex-1 min-h-0"
        style={{ minHeight: "min(70vh, 640px)" }}
      >
        {/* Conversation list */}
        <div
          className={`chat-terminal rounded-2xl border overflow-hidden flex flex-col min-h-0 ${
            activeId || other ? "hidden sm:flex" : "flex"
          }`}
          style={panelStyle}
        >
          <div
            className="px-3.5 py-3 border-b flex items-center gap-2 shrink-0"
            style={{
              borderColor: "hsl(190 30% 40% / 0.2)",
              background: "linear-gradient(90deg, hsl(210 50% 40% / 0.08), transparent)",
            }}
          >
            <Users className="w-3.5 h-3.5 text-cyan-300/70" />
            <p className="text-[10px] font-display tracking-[0.18em] text-muted-foreground uppercase">
              Private links
            </p>
          </div>
          <div className="chat-scroll flex-1 overflow-y-auto min-h-0">
            {conversations.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <Radio className="w-5 h-5 text-muted-foreground/50 mb-2" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  No private channels yet. Open a profile and whisper an operative.
                </p>
              </div>
            )}
            {conversations.map((c) => {
              const oid = (c.participant_ids || []).find((id) => id !== myChar.id);
              const oName = names[oid]?.name || "Pilot";
              const active = activeId === c.id;
              const unread = Number(c.unread_count || 0);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openConversation(c)}
                  className={`w-full text-left px-3.5 py-3 border-b transition-all duration-150 ${
                    active ? "bg-cyan-500/10" : "hover:bg-white/[0.03]"
                  }`}
                  style={{
                    borderColor: "hsl(210 18% 22% / 0.5)",
                    boxShadow: active ? "inset 3px 0 0 hsl(190 90% 50%)" : undefined,
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-display font-bold border shrink-0"
                      style={{
                        color: "hsl(190 70% 65%)",
                        borderColor: "hsl(210 20% 40% / 0.4)",
                        background: "hsl(220 18% 14% / 0.9)",
                      }}
                    >
                      {oName[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-display font-semibold truncate text-foreground/95">
                          {oName}
                        </p>
                        {unread > 0 && (
                          <span className="chat-unread-pulse ml-auto shrink-0 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full text-[9px] font-bold flex items-center justify-center bg-cyan-400 text-background">
                            {unread > 9 ? "9+" : unread}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground/75 truncate mt-0.5">
                        {c.last_message_preview || "Encrypted channel ready"}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Thread */}
        <div
          className={`chat-terminal rounded-2xl border flex flex-col min-h-0 overflow-hidden ${
            !activeId && !other ? "hidden sm:flex" : "flex"
          }`}
          style={panelStyle}
        >
          {other ? (
            <>
              <div
                className="flex items-center gap-3 px-3.5 py-3 border-b shrink-0"
                style={{
                  borderColor: "hsl(190 30% 40% / 0.2)",
                  background: "linear-gradient(90deg, hsl(210 50% 40% / 0.08), transparent 60%)",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveId(null);
                    setOther(null);
                  }}
                  className="sm:hidden p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="relative shrink-0">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-display font-bold border"
                    style={{
                      color: "hsl(190 70% 65%)",
                      borderColor: "hsl(210 20% 40% / 0.45)",
                      background: "hsl(220 18% 14%)",
                    }}
                  >
                    {(other.name || "?")[0]?.toUpperCase()}
                  </div>
                  <span
                    className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
                    style={{ background: statusColor, borderColor: "hsl(230 30% 8%)" }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    className="font-display font-semibold text-sm truncate text-left hover:text-cyan-300 transition-colors"
                    onClick={() => onTagSender?.(other)}
                  >
                    {other.name}
                  </button>
                  <p className="text-[10px] font-display tracking-wide" style={{ color: statusColor }}>
                    {statusLabel}
                  </p>
                </div>
              </div>

              <div ref={scrollRef} className="chat-scroll flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-3 min-h-0">
                {messages.length === 0 && (
                  <div className="text-center py-10 text-xs text-muted-foreground">
                    Secure link established — say hello.
                  </div>
                )}
                {messages.map((m) => (
                  <ChatMessageItem
                    key={m.id}
                    msg={{
                      ...m,
                      sender_name: m.sender_id === myChar.id ? myChar.name : other.name,
                      sender_level: m.sender_id === myChar.id ? myChar.level : other.level,
                      sender_guild_tag: "",
                    }}
                    isMine={m.sender_id === myChar.id}
                    onTagSender={onTagSender}
                    showAvatar
                  />
                ))}
              </div>

              <ChatComposeBar
                value={input}
                onChange={setInput}
                onSend={send}
                sending={sending}
                maxLength={500}
                placeholder={`Whisper to ${other.name}…`}
              />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 border"
                style={{
                  borderColor: "hsl(190 50% 45% / 0.3)",
                  background: "hsl(190 40% 20% / 0.2)",
                }}
              >
                <MessagesSquare className="w-6 h-6 text-cyan-300/70" />
              </motion.div>
              <p className="font-display font-semibold text-sm text-foreground/90 mb-1">
                Select a private channel
              </p>
              <p className="text-xs text-muted-foreground max-w-[14rem] leading-relaxed">
                Your encrypted conversations appear on the left. Start one from any operative profile.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

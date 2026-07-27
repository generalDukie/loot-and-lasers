import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Globe } from "lucide-react";
import { loadGlobal, subscribeGlobal, sendGlobal } from "@/lib/chatEngine";
import { useToast } from "@/components/ui/use-toast";
import ChatMessageItem from "@/components/social/ChatMessageItem";

export default function GlobalChatPanel({ open, onClose, myChar, onTagSender }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef(null);
  const { toast } = useToast();

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    loadGlobal().then((msgs) => {
      if (!mounted) return;
      setMessages(msgs.reverse());
      setTimeout(scrollToBottom, 50);
    });
    const unsub = subscribeGlobal((event) => {
      if (event.type === "create") {
        setMessages((prev) => {
          if (prev.some((m) => m.id === event.data.id)) return prev;
          return [...prev, event.data];
        });
        if (atBottom) setTimeout(scrollToBottom, 50);
      } else if (event.type === "update") {
        setMessages((prev) => prev.map((m) => (m.id === event.data.id ? event.data : m)));
      } else if (event.type === "delete") {
        setMessages((prev) => prev.filter((m) => m.id !== event.data.id));
      }
    });
    return () => { mounted = false; unsub?.(); };
  }, [open, scrollToBottom, atBottom]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
  }

  async function send() {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setInput("");
    try {
      await sendGlobal(content);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || "Failed to send";
      toast({ title: "Chat", description: msg, variant: "destructive" });
      setInput(content);
    } finally {
      setSending(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-[60] bg-background/50 backdrop-blur-sm sm:bg-transparent"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 32 }}
            className="fixed top-0 right-0 bottom-0 z-[61] w-full sm:w-96 flex flex-col bg-card/95 backdrop-blur-md border-l border-border/60"
          >
            <div className="flex items-center gap-2 p-3 border-b border-border/40">
              <Globe className="w-4 h-4 text-primary" />
              <h2 className="font-display font-bold text-sm tracking-wide flex-1">GLOBAL CHAT</h2>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>

            <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto p-3 space-y-3">
              {messages.length === 0 && <p className="text-center text-xs text-muted-foreground py-8">Be the first to broadcast across the galaxy...</p>}
              {messages.map((m) => (
                <ChatMessageItem key={m.id} msg={m} isMine={m.sender_id === myChar?.id} onTagSender={onTagSender} />
              ))}
            </div>

            <div className="p-3 border-t border-border/40 flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                maxLength={280}
                placeholder="Broadcast a message..."
                className="flex-1 bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50"
              />
              <button onClick={send} disabled={sending || !input.trim()}
                className="p-2 rounded-lg painted-btn disabled:opacity-40">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
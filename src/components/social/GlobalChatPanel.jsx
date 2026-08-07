import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Globe, Radio, ChevronDown } from "lucide-react";
import { loadGlobal, subscribeGlobal, sendGlobal } from "@/lib/chatEngine";
import { useToast } from "@/components/ui/use-toast";
import ChatMessageItem from "@/components/social/ChatMessageItem";
import ChatComposeBar from "@/components/social/ChatComposeBar";

/**
 * Global station chat.
 * variant="drawer" — slide-over from hub
 * variant="page" — full panel for /messages
 */
export default function GlobalChatPanel({
  open = true,
  onClose,
  myChar,
  onTagSender,
  onWhisper,
  variant = "drawer",
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef(null);
  const { toast } = useToast();
  const isPage = variant === "page";
  const active = isPage ? true : open;

  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    if (!active) return;
    let mounted = true;
    loadGlobal().then((msgs) => {
      if (!mounted) return;
      setMessages(msgs.reverse());
      setTimeout(() => scrollToBottom(false), 50);
    });
    const unsub = subscribeGlobal((event) => {
      if (event.type === "create") {
        setMessages((prev) => {
          if (prev.some((m) => m.id === event.data.id)) return prev;
          return [...prev, event.data];
        });
        if (atBottom) setTimeout(() => scrollToBottom(true), 50);
      } else if (event.type === "update") {
        setMessages((prev) => prev.map((m) => (m.id === event.data.id ? event.data : m)));
      } else if (event.type === "delete") {
        setMessages((prev) => prev.filter((m) => m.id !== event.data.id));
      }
    });
    return () => {
      mounted = false;
      unsub?.();
    };
  }, [active, scrollToBottom, atBottom]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }

  async function send() {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setInput("");
    try {
      await sendGlobal(content);
      setTimeout(() => scrollToBottom(true), 40);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || "Failed to send";
      toast({ title: "Chat", description: msg, variant: "destructive" });
      setInput(content);
    } finally {
      setSending(false);
    }
  }

  const body = (
    <>
      <div
        className={`flex items-center gap-3 border-b shrink-0 ${isPage ? "px-4 py-3" : "p-3"}`}
        style={{
          borderColor: "hsl(190 30% 40% / 0.22)",
          background: "linear-gradient(90deg, hsl(190 50% 40% / 0.08), transparent 55%)",
        }}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center border shrink-0"
          style={{
            borderColor: "hsl(190 70% 50% / 0.4)",
            background: "hsl(190 60% 30% / 0.25)",
            boxShadow: "0 0 14px hsl(190 90% 50% / 0.2)",
          }}
        >
          <Globe className="w-4 h-4 text-cyan-300" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display font-bold text-sm tracking-wide text-foreground/95 flex items-center gap-2">
            Global Frequency
            <span className="inline-flex items-center gap-1 text-[9px] font-normal tracking-[0.16em] uppercase text-emerald-300/80">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          </h2>
          <p className="text-[11px] text-muted-foreground truncate">
            {isPage ? "Open channel — all operatives on this station" : "GLOBAL CHAT"}
          </p>
        </div>
        {!isPage && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="chat-scroll absolute inset-0 overflow-y-auto px-3 sm:px-4 py-4 space-y-3.5"
        >
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 border"
                style={{
                  borderColor: "hsl(190 50% 45% / 0.35)",
                  background: "hsl(190 40% 20% / 0.25)",
                  boxShadow: "0 0 28px hsl(190 90% 50% / 0.12)",
                }}
              >
                <Radio className="w-6 h-6 text-cyan-300/80" />
              </div>
              <p className="font-display font-semibold text-sm text-foreground/90 mb-1">
                Channel clear
              </p>
              <p className="text-xs text-muted-foreground max-w-[16rem] leading-relaxed">
                Be the first to broadcast across the galaxy. Keep it sharp — 280 characters.
              </p>
            </div>
          )}
          {messages.map((m) => (
            <ChatMessageItem
              key={m.id}
              msg={m}
              isMine={m.sender_id === myChar?.id}
              onTagSender={onTagSender}
              onWhisper={onWhisper}
            />
          ))}
        </div>

        <AnimatePresence>
          {!atBottom && messages.length > 0 && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              onClick={() => scrollToBottom(true)}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-display font-semibold border backdrop-blur-md transition-colors hover:border-cyan-400/50"
              style={{
                borderColor: "hsl(190 50% 45% / 0.4)",
                background: "hsl(222 28% 12% / 0.92)",
                color: "hsl(190 80% 75%)",
                boxShadow: "0 8px 20px rgba(0,0,0,0.35)",
              }}
            >
              <ChevronDown className="w-3.5 h-3.5" />
              Latest
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <ChatComposeBar
        value={input}
        onChange={setInput}
        onSend={send}
        sending={sending}
        maxLength={280}
        placeholder="Broadcast to the station…"
      />
    </>
  );

  if (isPage) {
    return (
      <div
        className="chat-terminal rounded-2xl border flex flex-col flex-1 min-h-0 overflow-hidden"
        style={{
          borderColor: "hsl(190 40% 40% / 0.28)",
          background: `
            linear-gradient(165deg, hsl(222 26% 11% / 0.92), hsl(230 30% 7% / 0.96)),
            repeating-linear-gradient(0deg, transparent, transparent 11px, hsl(190 40% 50% / 0.02) 11px, hsl(190 40% 50% / 0.02) 12px)
          `,
          boxShadow: "0 16px 40px rgba(0,0,0,0.28), inset 0 1px 0 hsl(190 60% 60% / 0.08)",
          minHeight: "min(70vh, 640px)",
        }}
      >
        {body}
      </div>
    );
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[60] bg-background/50 backdrop-blur-sm sm:bg-transparent"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 32 }}
            className="fixed top-0 right-0 bottom-0 z-[61] w-full sm:w-96 flex flex-col border-l"
            style={{
              borderColor: "hsl(190 40% 40% / 0.35)",
              background: "linear-gradient(180deg, hsl(222 28% 11% / 0.97), hsl(230 32% 7% / 0.98))",
              boxShadow: "-12px 0 40px rgba(0,0,0,0.4)",
            }}
          >
            {body}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

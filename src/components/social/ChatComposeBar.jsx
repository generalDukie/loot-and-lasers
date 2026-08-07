import React, { useId } from "react";
import { Send } from "lucide-react";

/**
 * Polished station transmit bar — shared by global + private chat.
 */
export default function ChatComposeBar({
  value,
  onChange,
  onSend,
  sending = false,
  maxLength = 280,
  placeholder = "Transmit a message…",
  disabled = false,
}) {
  const id = useId();
  const len = value?.length || 0;
  const nearLimit = maxLength > 0 && len >= maxLength * 0.85;
  const canSend = !sending && !disabled && String(value || "").trim().length > 0;

  return (
    <div
      className="chat-compose shrink-0 border-t px-3 py-3 sm:px-4"
      style={{
        borderColor: "hsl(190 30% 40% / 0.22)",
        background: "linear-gradient(180deg, hsl(222 24% 10% / 0.55), hsl(230 28% 7% / 0.75))",
      }}
    >
      <div className="flex items-end gap-2.5">
        <div className="relative flex-1 min-w-0">
          <label htmlFor={id} className="sr-only">
            Message
          </label>
          <input
            id={id}
            value={value}
            disabled={disabled || sending}
            onChange={(e) => onChange?.(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (canSend) onSend?.();
              }
            }}
            maxLength={maxLength}
            placeholder={placeholder}
            className="chat-compose-input w-full rounded-2xl pl-4 pr-16 py-3 text-sm outline-none transition-all duration-200 disabled:opacity-50"
            style={{
              background: "hsl(230 25% 8% / 0.85)",
              border: "1px solid hsl(190 35% 40% / 0.28)",
              color: "hsl(210 20% 92%)",
              boxShadow: "inset 0 1px 0 hsl(190 50% 60% / 0.06)",
            }}
          />
          {maxLength > 0 && (
            <span
              className={`absolute right-3 bottom-2.5 text-[10px] tabular-nums font-display pointer-events-none ${
                nearLimit ? "text-amber-300/90" : "text-muted-foreground/45"
              }`}
            >
              {len}/{maxLength}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => canSend && onSend?.()}
          disabled={!canSend}
          aria-label="Send message"
          className="chat-send-btn shrink-0 inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 font-display font-semibold text-sm tracking-wide transition-all duration-150 disabled:opacity-35 disabled:pointer-events-none"
          style={{
            background: canSend
              ? "linear-gradient(180deg, hsl(190 90% 52%), hsl(192 90% 38%))"
              : "hsl(220 16% 18%)",
            color: canSend ? "hsl(230 25% 6%)" : "hsl(210 15% 55%)",
            boxShadow: canSend
              ? "0 4px 0 hsl(192 90% 22%), 0 0 16px hsl(190 90% 50% / 0.28)"
              : "none",
            border: "1px solid hsl(190 60% 50% / 0.35)",
          }}
        >
          <Send className="w-4 h-4" />
          <span className="hidden sm:inline">Send</span>
        </button>
      </div>
    </div>
  );
}

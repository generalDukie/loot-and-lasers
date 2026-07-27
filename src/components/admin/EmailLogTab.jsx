import React, { useCallback, useEffect, useState } from "react";
import { api } from "@/api/gameClient";
import { useToast } from "@/components/ui/use-toast";
import { Mail, RefreshCw, Send, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

const STATUS_ICON = {
  sent: CheckCircle2,
  failed: XCircle,
  fallback: AlertCircle,
};

const STATUS_COLOR = {
  sent: "text-emerald-400",
  failed: "text-destructive",
  fallback: "text-amber-400",
};

export default function EmailLogTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [config, setConfig] = useState(null);
  const [events, setEvents] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.auth.getEmailLog();
      setConfig(data.config || null);
      setEvents(data.events || []);
    } catch (e) {
      toast({
        title: "Failed to load email log",
        description: e?.message || "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const sendTest = async () => {
    setSending(true);
    try {
      const res = await api.auth.sendTestEmail();
      toast({
        title: "Test email sent",
        description: `Check ${res?.to || "your inbox"}.`,
      });
      await load();
    } catch (e) {
      toast({
        title: "Test email failed",
        description: e?.message || "Unknown error",
        variant: "destructive",
      });
      await load();
    } finally {
      setSending(false);
    }
  };

  if (loading && !config) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-muted/15 border border-border/20 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary" />
            <span className="text-sm font-display font-semibold">SMTP status</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded-lg bg-muted/30 border border-border/30 flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              onClick={sendTest}
              disabled={sending || !config?.enabled}
              className="text-xs px-3 py-1.5 rounded-lg painted-btn flex items-center gap-1 disabled:opacity-40"
            >
              <Send className="w-3 h-3" />
              {sending ? "Sending…" : "Send test"}
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {config?.enabled ? (
            <>
              Sending via <span className="text-foreground">{config.host}:{config.port}</span>
              {config.from ? <> from <span className="text-foreground">{config.from}</span></> : null}
            </>
          ) : (
            <>SMTP not configured — OTP/reset codes fall back to server console logs.</>
          )}
        </p>
      </div>

      {events.length === 0 ? (
        <p className="text-center text-xs text-muted-foreground italic py-8">No email events yet.</p>
      ) : (
        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {events.map((ev) => {
            const Icon = STATUS_ICON[ev.status] || AlertCircle;
            const color = STATUS_COLOR[ev.status] || "text-muted-foreground";
            return (
              <div key={ev.id} className="p-3 rounded-xl bg-muted/10 border border-border/20 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
                    <span className="font-medium uppercase tracking-wide">{ev.type}</span>
                    <span className="text-muted-foreground">→ {ev.to}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {new Date(ev.at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-muted-foreground truncate">{ev.subject}</p>
                {ev.error && (
                  <p className={`mt-1 ${ev.status === "failed" ? "text-destructive" : "text-amber-400"}`}>
                    {ev.error}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

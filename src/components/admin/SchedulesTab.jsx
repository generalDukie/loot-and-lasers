import React, { useEffect, useState } from "react";
import { Clock, Play, Pause, RefreshCw } from "lucide-react";
import { api } from "@/api/gameClient";
import { useToast } from "@/components/ui/use-toast";

/**
 * Admin schedule list + preview + pause/resume + manual tick.
 * Server remains authoritative; this is operational tooling only.
 */
export default function SchedulesTab() {
  const { toast } = useToast();
  const [schedules, setSchedules] = useState([]);
  const [audit, setAudit] = useState([]);
  const [preview, setPreview] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    key: "",
    displayName: "",
    recurrence: "daily",
    localTime: "00:00",
    timeZoneId: "America/New_York",
    missedRunPolicy: "latest_only",
    ambiguityPolicy: "earlier",
    skippedTimePolicy: "next_valid",
    handlerKey: "noop",
    count: 5,
  });

  async function load() {
    setLoading(true);
    try {
      const [s, a] = await Promise.all([api.time.listSchedules(), api.time.listScheduleAudit(30)]);
      setSchedules(s.schedules || []);
      setAudit(a.audit || []);
    } catch (e) {
      toast({ title: "Failed to load schedules", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function runPreview() {
    try {
      const res = await api.time.previewSchedule(form);
      setPreview(res.occurrences || []);
    } catch (e) {
      toast({ title: "Preview failed", description: e.message, variant: "destructive" });
    }
  }

  async function create() {
    if (!form.key) {
      toast({ title: "key required", variant: "destructive" });
      return;
    }
    try {
      await api.time.createSchedule(form);
      toast({ title: "Schedule created" });
      setForm((f) => ({ ...f, key: "", displayName: "" }));
      load();
    } catch (e) {
      toast({ title: "Create failed", description: e.message, variant: "destructive" });
    }
  }

  async function toggle(id, enabled) {
    try {
      if (enabled) await api.time.resumeSchedule(id);
      else await api.time.pauseSchedule(id);
      load();
    } catch (e) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    }
  }

  async function tick() {
    try {
      const res = await api.time.tickSchedules();
      toast({ title: "Scheduler tick", description: `Scanned ${res.scanned ?? 0}` });
      load();
    } catch (e) {
      toast({ title: "Tick failed", description: e.message, variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          <h2 className="font-display font-semibold text-sm tracking-wider">Schedules</h2>
        </div>
        <button
          type="button"
          onClick={tick}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-primary/15 text-primary border border-primary/30"
        >
          <RefreshCw className="w-3 h-3" /> Tick now
        </button>
      </div>

      <div className="space-y-2">
        {schedules.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No schedules seeded yet.</p>
        )}
        {schedules.map((s) => (
          <div key={s.id} className="p-3 rounded-xl bg-muted/15 border border-border/20 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-display font-semibold">{s.displayName || s.key}</p>
                <p className="text-[10px] text-muted-foreground">
                  {s.key} · {s.recurrence} {s.localTime} {s.timeZoneId} · v{s.version}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  next {s.nextRunAtUtc || "—"} · last {s.lastRunAtUtc || "—"} · missed={s.missedRunPolicy}
                </p>
              </div>
              <button
                type="button"
                onClick={() => toggle(s.id, !s.enabled)}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-border/40 bg-muted/20"
              >
                {s.enabled ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                {s.enabled ? "Pause" : "Resume"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 rounded-xl border border-border/30 bg-muted/10 space-y-2">
        <p className="text-xs font-display font-semibold tracking-wider">Create / Preview</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            ["key", "key"],
            ["displayName", "display name"],
            ["localTime", "local time HH:MM"],
            ["timeZoneId", "IANA zone"],
            ["handlerKey", "handler"],
          ].map(([field, label]) => (
            <label key={field} className="text-[10px] text-muted-foreground space-y-0.5">
              {label}
              <input
                className="w-full text-xs px-2 py-1 rounded bg-background border border-border/40"
                value={form[field]}
                onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
              />
            </label>
          ))}
          <label className="text-[10px] text-muted-foreground space-y-0.5">
            recurrence
            <select
              className="w-full text-xs px-2 py-1 rounded bg-background border border-border/40"
              value={form.recurrence}
              onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value }))}
            >
              <option value="daily">daily</option>
              <option value="weekly">weekly</option>
              <option value="monthly">monthly</option>
            </select>
          </label>
          <label className="text-[10px] text-muted-foreground space-y-0.5">
            missed-run
            <select
              className="w-full text-xs px-2 py-1 rounded bg-background border border-border/40"
              value={form.missedRunPolicy}
              onChange={(e) => setForm((f) => ({ ...f, missedRunPolicy: e.target.value }))}
            >
              <option value="latest_only">latest_only</option>
              <option value="catch_up_all">catch_up_all</option>
              <option value="skip">skip</option>
            </select>
          </label>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={runPreview}
            className="text-xs px-3 py-1.5 rounded-lg bg-muted/30 border border-border/30"
          >
            Preview next 5
          </button>
          <button
            type="button"
            onClick={create}
            className="text-xs px-3 py-1.5 rounded-lg bg-primary/20 text-primary border border-primary/30"
          >
            Create
          </button>
        </div>
        {preview.length > 0 && (
          <ul className="text-[10px] text-muted-foreground space-y-1 font-mono">
            {preview.map((o) => (
              <li key={o.occurrenceId}>
                {o.localDate} {o.localTime} {o.timeZoneId} → {o.scheduledAtUtc}
                {o.dstAdjusted ? " · DST adj" : ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1">
        <p className="text-xs font-display font-semibold tracking-wider">Recent audit</p>
        {audit.slice(0, 12).map((a) => (
          <p key={a.id} className="text-[10px] text-muted-foreground font-mono">
            {a.createdAt} · {a.action} · {a.scheduleId || "—"} · {a.occurrenceId || ""}
          </p>
        ))}
      </div>
    </div>
  );
}

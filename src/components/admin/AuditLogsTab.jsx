import React, { useCallback, useEffect, useState } from "react";
import { api } from "@/api/gameClient";
import { useToast } from "@/components/ui/use-toast";
import { ScrollText, Search, RefreshCw, Link2, MessageSquarePlus } from "lucide-react";

const CATEGORIES = [
  "",
  "administration",
  "currency",
  "inventory",
  "moderation",
  "reward",
  "shop",
  "mail",
  "arena",
  "audit",
];

export default function AuditLogsTab() {
  const { toast } = useToast();
  const [filters, setFilters] = useState({
    category: "",
    action: "",
    accountId: "",
    characterId: "",
    correlationId: "",
    highRisk: false,
    failedOnly: false,
    limit: 40,
    offset: 0,
  });
  const [result, setResult] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = {
        limit: filters.limit,
        offset: filters.offset,
      };
      if (filters.category) q.category = filters.category;
      if (filters.action) q.action = filters.action;
      if (filters.accountId) q.accountId = filters.accountId;
      if (filters.characterId) q.characterId = filters.characterId;
      if (filters.correlationId) q.correlationId = filters.correlationId;
      if (filters.highRisk) q.highRisk = "1";
      if (filters.failedOnly) q.failedOnly = "1";
      const data = await api.audit.search(q);
      setResult(data);
    } catch (e) {
      toast({ title: "Audit search failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function openDetail(id) {
    setSelected(id);
    try {
      const d = await api.audit.get(id);
      setDetail(d);
    } catch (e) {
      toast({ title: "Could not load audit", description: e.message, variant: "destructive" });
    }
  }

  async function addNote() {
    if (!selected || !note.trim()) return;
    try {
      await api.audit.annotate(selected, { note: note.trim() });
      setNote("");
      const d = await api.audit.get(selected);
      setDetail(d);
      toast({ title: "Annotation added" });
    } catch (e) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
  }

  async function exportRows() {
    try {
      const data = await api.audit.export({
        category: filters.category || undefined,
        accountId: filters.accountId || undefined,
        limit: 200,
      });
      const blob = new Blob([JSON.stringify(data.items, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-export-${data.exportId || Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export ready", description: `${data.items.length} rows` });
    } catch (e) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-primary" />
          <h2 className="font-display font-semibold text-sm">Audit Logs</h2>
          <span className="text-[10px] text-muted-foreground">{result.total} matching</span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={exportRows}
            className="text-[10px] px-2 py-1 rounded border border-border/40 hover:border-primary/40"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={load}
            className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-2">
        <select
          value={filters.category}
          onChange={(e) => setFilters((f) => ({ ...f, offset: 0, category: e.target.value }))}
          className="bg-muted/40 border border-border/40 rounded-lg px-2 py-1.5 text-xs"
        >
          {CATEGORIES.map((c) => (
            <option key={c || "all"} value={c}>
              {c || "All categories"}
            </option>
          ))}
        </select>
        <input
          value={filters.action}
          onChange={(e) => setFilters((f) => ({ ...f, offset: 0, action: e.target.value }))}
          placeholder="Action"
          className="bg-muted/40 border border-border/40 rounded-lg px-2 py-1.5 text-xs"
        />
        <input
          value={filters.accountId}
          onChange={(e) => setFilters((f) => ({ ...f, offset: 0, accountId: e.target.value }))}
          placeholder="Account ID"
          className="bg-muted/40 border border-border/40 rounded-lg px-2 py-1.5 text-xs"
        />
        <input
          value={filters.characterId}
          onChange={(e) => setFilters((f) => ({ ...f, offset: 0, characterId: e.target.value }))}
          placeholder="Character ID"
          className="bg-muted/40 border border-border/40 rounded-lg px-2 py-1.5 text-xs"
        />
        <input
          value={filters.correlationId}
          onChange={(e) => setFilters((f) => ({ ...f, offset: 0, correlationId: e.target.value }))}
          placeholder="Correlation ID"
          className="bg-muted/40 border border-border/40 rounded-lg px-2 py-1.5 text-xs"
        />
        <div className="flex items-center gap-3 text-[11px]">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={filters.highRisk}
              onChange={(e) => setFilters((f) => ({ ...f, offset: 0, highRisk: e.target.checked }))}
            />
            High risk
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={filters.failedOnly}
              onChange={(e) => setFilters((f) => ({ ...f, offset: 0, failedOnly: e.target.checked }))}
            />
            Failed only
          </label>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="painted-panel canvas-grain p-2 max-h-[28rem] overflow-y-auto space-y-1">
          {result.items.length === 0 && (
            <p className="text-xs text-muted-foreground italic p-3">No audit entries yet.</p>
          )}
          {result.items.map((e) => (
            <button
              key={e.auditId}
              type="button"
              onClick={() => openDetail(e.auditId)}
              className={`w-full text-left p-2 rounded-lg border text-[11px] ${
                selected === e.auditId ? "border-primary/50 bg-primary/10" : "border-border/20 hover:border-border/40"
              }`}
            >
              <div className="flex justify-between gap-2">
                <span className="font-semibold truncate">{e.action}</span>
                <span className="text-muted-foreground shrink-0">{e.severity}</span>
              </div>
              <div className="text-muted-foreground flex justify-between gap-2 mt-0.5">
                <span className="truncate">{e.category} · {e.result}</span>
                <span className="shrink-0">{new Date(e.occurredAt).toLocaleString()}</span>
              </div>
            </button>
          ))}
          <div className="flex justify-between pt-2">
            <button
              type="button"
              disabled={filters.offset <= 0}
              onClick={() => setFilters((f) => ({ ...f, offset: Math.max(0, f.offset - f.limit) }))}
              className="text-[10px] disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={filters.offset + filters.limit >= result.total}
              onClick={() => setFilters((f) => ({ ...f, offset: f.offset + f.limit }))}
              className="text-[10px] disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>

        <div className="painted-panel canvas-grain p-3 space-y-3 max-h-[28rem] overflow-y-auto">
          {!detail ? (
            <p className="text-xs text-muted-foreground italic flex items-center gap-1">
              <Search className="w-3 h-3" /> Select an entry
            </p>
          ) : (
            <>
              <div>
                <p className="font-display font-semibold text-sm">{detail.entry.action}</p>
                <p className="text-[10px] text-muted-foreground break-all">{detail.entry.auditId}</p>
              </div>
              <Meta label="Result" value={`${detail.entry.result} · ${detail.entry.severity}`} />
              <Meta label="Actor" value={`${detail.entry.actorType} ${detail.entry.actorId || ""}`} />
              <Meta
                label="Target"
                value={`${detail.entry.targetType || "—"} ${detail.entry.targetId || ""}`}
              />
              <Meta label="Subject" value={`${detail.entry.subjectType || "—"} ${detail.entry.subjectId || ""}`} />
              <Meta label="Reason" value={detail.entry.reasonText || detail.entry.reasonCode || "—"} />
              {detail.entry.correlationId && (
                <button
                  type="button"
                  className="text-[10px] text-primary flex items-center gap-1"
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      offset: 0,
                      correlationId: detail.entry.correlationId,
                    }))
                  }
                >
                  <Link2 className="w-3 h-3" /> Correlation {detail.entry.correlationId}
                </button>
              )}
              <JsonBlock label="Before" value={detail.entry.beforeState} />
              <JsonBlock label="After" value={detail.entry.afterState} />
              <JsonBlock label="Change set" value={detail.entry.changeSet} />
              <JsonBlock label="Metadata" value={detail.entry.metadata} />

              <div className="space-y-1.5 border-t border-border/30 pt-2">
                <p className="text-[10px] font-display text-muted-foreground">ANNOTATIONS</p>
                {(detail.annotations || []).map((a) => (
                  <div key={a.annotationId} className="text-[11px] p-2 rounded bg-muted/20">
                    <p>{a.note}</p>
                    <p className="text-[9px] text-muted-foreground mt-1">
                      {a.authorEmail || a.authorId} · {new Date(a.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
                <div className="flex gap-1.5">
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add annotation…"
                    className="flex-1 bg-muted/40 border border-border/40 rounded-lg px-2 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    onClick={addNote}
                    className="px-2 rounded-lg border border-primary/40 text-primary"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <div className="text-[11px]">
      <span className="text-muted-foreground">{label}: </span>
      <span className="break-all">{value}</span>
    </div>
  );
}

function JsonBlock({ label, value }) {
  if (value == null) return null;
  return (
    <div>
      <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
      <pre className="text-[10px] p-2 rounded bg-muted/20 overflow-x-auto max-h-32">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

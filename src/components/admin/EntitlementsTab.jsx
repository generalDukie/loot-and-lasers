import React, { useEffect, useState } from "react";
import { KeyRound, Search, Gift, Ban, RotateCcw } from "lucide-react";
import { api } from "@/api/gameClient";
import { useToast } from "@/components/ui/use-toast";

/**
 * Admin entitlement search / grant / revoke / restore.
 * All mutations go through /api/entitlements — no direct DB edits.
 */
export default function EntitlementsTab() {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    accountId: "",
    key: "",
    status: "",
  });
  const [grant, setGrant] = useState({
    accountId: "",
    characterId: "",
    entitlementKey: "account.rename_token",
    quantity: 1,
    reason: "",
    confirm: false,
    idempotencyKey: "",
  });
  const [detail, setDetail] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const params = {};
      if (filters.accountId) params.accountId = filters.accountId;
      if (filters.key) params.key = filters.key;
      if (filters.status) params.status = filters.status;
      const [s, a] = await Promise.all([
        api.entitlements.adminSearch(params),
        api.entitlements.adminAudit({ limit: 30 }),
      ]);
      setItems(s.items || []);
      setTotal(s.total || 0);
      setAudit(a.audit || []);
    } catch (e) {
      toast({ title: "Load failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function doGrant() {
    if (!grant.accountId || !grant.entitlementKey || !grant.reason) {
      toast({ title: "accountId, key, and reason required", variant: "destructive" });
      return;
    }
    try {
      const res = await api.entitlements.adminGrant({
        ...grant,
        quantity: Number(grant.quantity) || 1,
        idempotencyKey: grant.idempotencyKey || undefined,
        confirm: grant.confirm,
      });
      toast({
        title: res.created ? "Granted" : res.alreadyOwned ? "Already owned" : "Idempotent replay",
      });
      load();
    } catch (e) {
      toast({ title: "Grant failed", description: e.message, variant: "destructive" });
    }
  }

  async function openDetail(id) {
    try {
      setDetail(await api.entitlements.adminGet(id));
    } catch (e) {
      toast({ title: "Detail failed", description: e.message, variant: "destructive" });
    }
  }

  async function revoke(id) {
    const reason = window.prompt("Revocation reason?");
    if (!reason) return;
    try {
      await api.entitlements.adminRevoke(id, { reason });
      toast({ title: "Revoked" });
      setDetail(null);
      load();
    } catch (e) {
      toast({ title: "Revoke failed", description: e.message, variant: "destructive" });
    }
  }

  async function restore(id) {
    const reason = window.prompt("Restore reason?");
    if (!reason) return;
    try {
      await api.entitlements.adminRestore(id, { reason });
      toast({ title: "Restored" });
      setDetail(null);
      load();
    } catch (e) {
      toast({ title: "Restore failed", description: e.message, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-primary" />
        <h2 className="font-display font-semibold text-sm tracking-wider">Entitlements</h2>
        <span className="text-[10px] text-muted-foreground">({total})</span>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        {["accountId", "key", "status"].map((field) => (
          <label key={field} className="text-[10px] text-muted-foreground space-y-0.5">
            {field}
            <input
              className="block text-xs px-2 py-1 rounded bg-background border border-border/40 min-w-[8rem]"
              value={filters[field]}
              onChange={(e) => setFilters((f) => ({ ...f, [field]: e.target.value }))}
            />
          </label>
        ))}
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-primary/15 text-primary border border-primary/30"
        >
          <Search className="w-3 h-3" /> Search
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-2 max-h-72 overflow-auto">
          {items.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No entitlements matched.</p>
          )}
          {items.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => openDetail(e.id)}
              className="w-full text-left p-2.5 rounded-xl bg-muted/15 border border-border/20 hover:border-primary/30"
            >
              <p className="text-xs font-display font-semibold">{e.entitlementKey}</p>
              <p className="text-[10px] text-muted-foreground font-mono">
                {e.status} · qty {e.remainingQuantity}/{e.quantity} · {e.accountId?.slice(0, 8)}…
                {e.expiresAt ? ` · exp ${e.expiresAt}` : ""}
              </p>
            </button>
          ))}
        </div>
      )}

      {detail && (
        <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 space-y-2">
          <div className="flex justify-between gap-2">
            <p className="text-xs font-display font-semibold">{detail.definition?.displayName || detail.entitlement.entitlementKey}</p>
            <button type="button" className="text-[10px] text-muted-foreground" onClick={() => setDetail(null)}>
              Close
            </button>
          </div>
          <pre className="text-[10px] font-mono whitespace-pre-wrap break-all text-muted-foreground max-h-40 overflow-auto">
            {JSON.stringify(detail.entitlement, null, 2)}
          </pre>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => revoke(detail.entitlement.id)}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-border/40"
            >
              <Ban className="w-3 h-3" /> Revoke
            </button>
            <button
              type="button"
              onClick={() => restore(detail.entitlement.id)}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-border/40"
            >
              <RotateCcw className="w-3 h-3" /> Restore
            </button>
          </div>
        </div>
      )}

      <div className="p-3 rounded-xl border border-border/30 bg-muted/10 space-y-2">
        <p className="text-xs font-display font-semibold tracking-wider flex items-center gap-1">
          <Gift className="w-3.5 h-3.5" /> Administrator grant
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[
            ["accountId", "account id"],
            ["characterId", "character id (optional)"],
            ["entitlementKey", "entitlement key"],
            ["quantity", "quantity"],
            ["reason", "reason"],
            ["idempotencyKey", "idempotency key (optional)"],
          ].map(([field, label]) => (
            <label key={field} className="text-[10px] text-muted-foreground space-y-0.5">
              {label}
              <input
                className="w-full text-xs px-2 py-1 rounded bg-background border border-border/40"
                value={grant[field]}
                onChange={(e) => setGrant((g) => ({ ...g, [field]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <input
            type="checkbox"
            checked={grant.confirm}
            onChange={(e) => setGrant((g) => ({ ...g, confirm: e.target.checked }))}
          />
          Confirm high-value grant (premium / founder / subscription / expansion)
        </label>
        <button
          type="button"
          onClick={doGrant}
          className="text-xs px-3 py-1.5 rounded-lg bg-primary/20 text-primary border border-primary/30"
        >
          Grant
        </button>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-display font-semibold tracking-wider">Recent audit</p>
        {audit.slice(0, 12).map((a) => (
          <p key={a.id} className="text-[10px] text-muted-foreground font-mono">
            {a.createdAt} · {a.action} · {a.entitlementKey || "—"} · {a.accountId?.slice(0, 8) || ""}
          </p>
        ))}
      </div>
    </div>
  );
}

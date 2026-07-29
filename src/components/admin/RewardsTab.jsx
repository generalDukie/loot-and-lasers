import React, { useEffect, useState } from "react";
import { Gift, Search, RotateCcw } from "lucide-react";
import { api } from "@/api/gameClient";
import { useToast } from "@/components/ui/use-toast";

/**
 * Admin reward claim search, detail, grant, and failed-delivery retry.
 * All mutations go through /api/rewards — no direct balance edits.
 */
export default function RewardsTab() {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    accountId: "",
    characterId: "",
    rewardSource: "",
    status: "",
    claimKey: "",
  });
  const [grant, setGrant] = useState({
    accountId: "",
    characterId: "",
    stardust: 0,
    nova_crystals: 0,
    experience: 0,
    reason: "",
    compensation: false,
    idempotencyKey: "",
  });
  const [detail, setDetail] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const params = {};
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params[k] = v;
      });
      const [s, a] = await Promise.all([
        api.rewards.adminSearch(params),
        api.rewards.adminAudit({ limit: 30 }),
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
    if (!grant.accountId || !grant.characterId || !grant.reason) {
      toast({ title: "accountId, characterId, and reason required", variant: "destructive" });
      return;
    }
    try {
      const res = await api.rewards.adminGrant({
        accountId: grant.accountId,
        characterId: grant.characterId,
        reason: grant.reason,
        compensation: grant.compensation,
        idempotencyKey: grant.idempotencyKey || undefined,
        rewards: {
          stardust: Number(grant.stardust) || 0,
          nova_crystals: Number(grant.nova_crystals) || 0,
          experience: Number(grant.experience) || 0,
        },
      });
      toast({
        title: res.created ? "Granted" : "Idempotent replay",
      });
      load();
    } catch (e) {
      toast({ title: "Grant failed", description: e.message, variant: "destructive" });
    }
  }

  async function openDetail(id) {
    try {
      setDetail(await api.rewards.adminGet(id));
    } catch (e) {
      toast({ title: "Detail failed", description: e.message, variant: "destructive" });
    }
  }

  async function retryDelivery(id) {
    const reason = window.prompt("Recovery reason?");
    if (!reason) return;
    try {
      await api.rewards.adminRetryDelivery(id, { reason });
      toast({ title: "Retry complete" });
      openDetail(id);
      load();
    } catch (e) {
      toast({ title: "Retry failed", description: e.message, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6 text-sm">
      <div className="flex items-center gap-2 text-lg font-display">
        <Gift className="w-5 h-5" /> Reward Claims
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {["accountId", "characterId", "rewardSource", "status", "claimKey"].map((k) => (
          <input
            key={k}
            className="bg-black/30 border border-white/10 rounded px-2 py-1"
            placeholder={k}
            value={filters[k]}
            onChange={(e) => setFilters((f) => ({ ...f, [k]: e.target.value }))}
          />
        ))}
      </div>
      <button
        type="button"
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-cyan-700/80 hover:bg-cyan-600"
        onClick={load}
      >
        <Search className="w-4 h-4" /> Search ({total})
      </button>

      {loading ? (
        <p className="opacity-60">Loading…</p>
      ) : (
        <div className="overflow-x-auto border border-white/10 rounded">
          <table className="w-full text-left">
            <thead className="bg-white/5">
              <tr>
                <th className="p-2">Source</th>
                <th className="p-2">Status</th>
                <th className="p-2">Account</th>
                <th className="p-2">Claim key</th>
                <th className="p-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr
                  key={c.id}
                  className="border-t border-white/5 hover:bg-white/5 cursor-pointer"
                  onClick={() => openDetail(c.id)}
                >
                  <td className="p-2">{c.rewardSource}</td>
                  <td className="p-2">{c.status}</td>
                  <td className="p-2 font-mono text-xs">{c.accountId}</td>
                  <td className="p-2 font-mono text-xs">{c.claimKey}</td>
                  <td className="p-2 text-xs opacity-70">{c.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div className="border border-white/10 rounded p-3 space-y-2 bg-black/20">
          <div className="flex justify-between items-center">
            <strong>Claim {detail.claim?.id}</strong>
            <button type="button" className="opacity-60" onClick={() => setDetail(null)}>
              Close
            </button>
          </div>
          <pre className="text-xs overflow-auto max-h-64 bg-black/40 p-2 rounded">
            {JSON.stringify(detail.claim, null, 2)}
          </pre>
          {(detail.claim?.status === "failed_retryable" || detail.claim?.status === "generated") && (
            <button
              type="button"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-amber-700/80"
              onClick={() => retryDelivery(detail.claim.id)}
            >
              <RotateCcw className="w-4 h-4" /> Retry delivery (persisted payload)
            </button>
          )}
          <div className="text-xs opacity-80">
            Audit: {(detail.audit || []).map((a) => a.action).join(" → ") || "—"}
          </div>
        </div>
      )}

      <div className="border border-white/10 rounded p-3 space-y-2">
        <strong>Compensation / admin grant</strong>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {["accountId", "characterId", "stardust", "nova_crystals", "experience", "reason", "idempotencyKey"].map(
            (k) => (
              <input
                key={k}
                className="bg-black/30 border border-white/10 rounded px-2 py-1"
                placeholder={k}
                value={grant[k]}
                onChange={(e) => setGrant((g) => ({ ...g, [k]: e.target.value }))}
              />
            )
          )}
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={grant.compensation}
            onChange={(e) => setGrant((g) => ({ ...g, compensation: e.target.checked }))}
          />
          Mark as compensation
        </label>
        <button
          type="button"
          className="px-3 py-1.5 rounded bg-emerald-700/80 hover:bg-emerald-600"
          onClick={doGrant}
        >
          Grant via reward service
        </button>
      </div>

      <div>
        <strong className="text-xs opacity-70">Recent audit</strong>
        <ul className="text-xs mt-1 space-y-1 max-h-40 overflow-auto">
          {audit.map((a) => (
            <li key={a.id} className="font-mono opacity-80">
              {a.createdAt} · {a.action} · {a.claimKey || a.claimId}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

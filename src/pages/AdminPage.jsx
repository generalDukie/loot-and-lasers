import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { api } from "@/api/gameClient";
import { useToast } from "@/components/ui/use-toast";
import { Shield, Filter, Send, Gavel, Crown, Ticket, Gift, RefreshCw, Mail, Clock, KeyRound, Coins, ScrollText } from "lucide-react";
import PlayerManager from "@/components/admin/PlayerManager";
import GuildAdmin from "@/components/admin/GuildAdmin";
import PromoCodeManager from "@/components/admin/PromoCodeManager";
import GrantItemTab from "@/components/admin/GrantItemTab";
import ServerRefreshTab from "@/components/admin/ServerRefreshTab";
import NovaSpendStats from "@/components/admin/NovaSpendStats";
import EmailLogTab from "@/components/admin/EmailLogTab";
import SchedulesTab from "@/components/admin/SchedulesTab";
import EntitlementsTab from "@/components/admin/EntitlementsTab";
import RewardsTab from "@/components/admin/RewardsTab";
import AuditLogsTab from "@/components/admin/AuditLogsTab";
import PageStage from "@/components/game/PageStage";

const TABS = [
  { key: "reports", label: "Reports", icon: Gavel },
  { key: "players", label: "Players", icon: Shield },
  { key: "guild", label: "Guilds", icon: Crown },
  { key: "promo", label: "Promo Codes", icon: Ticket },
  { key: "grant", label: "Grant Item", icon: Gift },
  { key: "rewards", label: "Rewards", icon: Coins },
  { key: "audit", label: "Audit", icon: ScrollText },
  { key: "filter", label: "Filter", icon: Filter },
  { key: "mail", label: "System Mail", icon: Send },
  { key: "email", label: "Email", icon: Mail },
  { key: "schedules", label: "Schedules", icon: Clock },
  { key: "entitlements", label: "Entitlements", icon: KeyRound },
  { key: "refresh", label: "Server", icon: RefreshCw },
  { key: "nova", label: "Economy", icon: Coins },
];

export default function AdminPage() {
  const [isAdmin, setIsAdmin] = useState(null);
  const [tab, setTab] = useState("reports");
  const { toast } = useToast();

  useEffect(() => { api.auth.me().then((u) => setIsAdmin(u?.role === "admin")).catch(() => setIsAdmin(false)); }, []);

  async function adminAction(payload) {
    try {
      const res = await api.functions.invoke("AdminModeration", payload);
      const data = res.data ?? res;
      if (payload.action === "give_item" && data?.item) {
        toast({
          title: "Gear granted",
          description: `${data.item.name} → ${data.character_name || "character"}`,
        });
      } else if (payload.action === "adjust_currency") {
        const parts = Object.entries(payload.deltas || {})
          .filter(([, v]) => v != null && v !== 0)
          .map(([k, v]) => `${v > 0 ? "+" : ""}${v} ${k.replace(/_/g, " ")}`);
        toast({
          title: "Currency updated",
          description: parts.length ? parts.join(" · ") : "Balances adjusted.",
        });
      } else if (payload.action === "set_role") {
        toast({
          title: data?.role === "admin" ? "Account promoted" : "Account demoted",
          description: data?.email
            ? `${data.email} is now ${data.role}. They must re-login for Admin to unlock.`
            : `Role is now ${data?.role || "updated"}. Target must re-login.`,
        });
      } else {
        toast({ title: "Done" });
      }
      return data;
    } catch (e) {
      toast({ title: "Failed", description: e?.response?.data?.error || e.message, variant: "destructive" });
      return null;
    }
  }

  if (isAdmin === null) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;
  if (!isAdmin) return <div className="text-center text-sm text-muted-foreground py-20">Admin access required.</div>;

  return (
    <PageStage className="space-y-4">
      <div className="flex items-center gap-2"><Shield className="w-5 h-5 text-primary" /><h1 className="font-display font-bold text-xl tracking-wider">Admin · Moderation</h1></div>
      <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-muted/20 border border-border/30">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-display font-semibold ${tab === t.key ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}><t.icon className="w-3.5 h-3.5" /> {t.label}</button>
        ))}
      </div>

      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        {tab === "reports" && <ReportsTab onResolve={(id, action) => adminAction({ action: "resolve_report", report_id: id, action_taken: action })} />}
        {tab === "players" && <PlayerManager onAction={adminAction} />}
        {tab === "guild" && <GuildAdmin onAction={adminAction} />}
        {tab === "promo" && <PromoCodeManager onAction={adminAction} />}
        {tab === "grant" && <GrantItemTab onAction={adminAction} />}
        {tab === "filter" && <FilterTab onSave={(words) => adminAction({ action: "edit_filter", words })} />}
        {tab === "mail" && <SystemMailTab onSend={(p) => adminAction({ action: "send_system_mail", ...p })} />}
        {tab === "email" && <EmailLogTab />}
        {tab === "schedules" && <SchedulesTab />}
        {tab === "entitlements" && <EntitlementsTab />}
        {tab === "rewards" && <RewardsTab />}
        {tab === "audit" && <AuditLogsTab />}
        {tab === "refresh" && <ServerRefreshTab />}
        {tab === "nova" && <NovaSpendStats />}
      </motion.div>
    </PageStage>
  );
}

function ReportsTab({ onResolve }) {
  const [reports, setReports] = useState([]);
  const load = () => { api.entities.Report.filter({ status: "open" }, "-created_date", 50).then(setReports); };
  useEffect(load, []);
  if (reports.length === 0) return <p className="text-center text-xs text-muted-foreground italic py-8">No open reports.</p>;
  return <div className="space-y-2">{reports.map((r) => (
    <div key={r.id} className="p-3 rounded-xl bg-muted/15 border border-border/20">
      <p className="text-sm font-display font-semibold">{r.reported_name} <span className="text-[10px] text-muted-foreground">· {r.context}</span></p>
      <p className="text-xs text-muted-foreground">{r.reason}</p>
      {r.message_snapshot && <p className="text-xs italic mt-1 p-2 rounded bg-muted/20">"{r.message_snapshot}"</p>}
      <div className="flex gap-2 mt-2">
        <button onClick={async () => { await onResolve(r.id, "warned"); load(); }} className="text-xs px-3 py-1 rounded-lg bg-muted/30 border border-border/30">Resolve</button>
      </div>
    </div>
  ))}</div>;
}

function FilterTab({ onSave }) {
  const [words, setWords] = useState([]);
  const [input, setInput] = useState("");
  useEffect(() => { api.entities.ModerationConfig.filter({ singleton: true }).then((c) => setWords(c[0]?.filtered_words || [])); }, []);
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Add filtered word..." className="flex-1 bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm outline-none" />
        <button onClick={() => { if (input.trim()) { setWords([...words, input.trim().toLowerCase()]); setInput(""); } }} className="painted-btn text-xs px-3 rounded-lg">Add</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {words.map((w, i) => (
          <span key={i} className="flex items-center gap-1 px-2 py-1 rounded-full bg-muted/30 border border-border/30 text-xs">
            {w}
            <button onClick={() => setWords(words.filter((_, j) => j !== i))} className="text-destructive">×</button>
          </span>
        ))}
        {words.length === 0 && <p className="text-xs text-muted-foreground italic">No filtered words.</p>}
      </div>
      <button onClick={() => onSave(words)} className="w-full painted-btn text-sm py-2 rounded-lg">Save Filter List</button>
    </div>
  );
}

function SystemMailTab({ onSend }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState("all");
  const [stardust, setStardust] = useState(0);
  const [expires, setExpires] = useState(30);

  return (
    <div className="space-y-3">
      <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm outline-none" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message..." rows={4} className="w-full bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm outline-none resize-none" />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted-foreground">Stardust<input type="number" value={stardust} onChange={(e) => setStardust(+e.target.value)} className="w-full bg-muted/30 border border-border/40 rounded-lg px-2 py-1 text-sm" /></label>
        <label className="text-xs text-muted-foreground">Expires (days)<input type="number" value={expires} onChange={(e) => setExpires(+e.target.value)} className="w-full bg-muted/30 border border-border/40 rounded-lg px-2 py-1 text-sm" /></label>
      </div>
      <select value={recipients} onChange={(e) => setRecipients(e.target.value)} className="w-full bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm">
        <option value="all">All Players</option>
      </select>
      <button onClick={async () => {
        const rewards = {};
        if (stardust) rewards.stardust = stardust;
        const res = await onSend({ subject, body, recipients, rewards: Object.keys(rewards).length ? rewards : undefined, expires_days: expires });
        if (res) { setSubject(""); setBody(""); }
      }} className="w-full painted-btn text-sm py-2 rounded-lg">Send System Mail</button>
    </div>
  );
}
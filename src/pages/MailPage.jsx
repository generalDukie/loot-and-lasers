import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/api/gameClient";
import { useToast } from "@/components/ui/use-toast";
import { getMail, sendPlayerMail, claimMailReward, markMailRead, deleteMail, restoreMail } from "@/lib/mailEngine";
import { getFriends, getCharactersByIds, getMyCharacter } from "@/lib/socialEngine";
import { getGuildMembership, acceptGuildInvite, acceptGuildRequest, declineGuildRequest } from "@/lib/guildUtils";
import { Mail, Inbox, Send, Cog, Trash2, Gift, Plus, Reply, Undo2, X, UserPlus, UserCheck } from "lucide-react";

const TABS = [
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "sent", label: "Sent", icon: Send },
  { key: "system", label: "System", icon: Cog },
  { key: "deleted", label: "Deleted", icon: Trash2 },
];

export default function MailPage() {
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState("inbox");
  const [mails, setMails] = useState([]);
  const [selected, setSelected] = useState(null);
  const [composing, setComposing] = useState(false);
  const [recipients, setRecipients] = useState([]);
  const { toast } = useToast();

  const load = useCallback(async () => {
    if (!me) return;
    const list = await getMail(me.id, tab);
    setMails(list);
    if (selected && !list.find((m) => m.id === selected.id)) setSelected(null);
  }, [me, tab, selected]);

  useEffect(() => {
    getMyCharacter().then((c) => {
      setMe(c || null);
    });
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!me) return;
    const unsub = api.entities.Mail.subscribe((event) => {
      if (event.data?.owner_id === me.id) load();
    });
    return () => unsub?.();
  }, [me, load]);

  useEffect(() => {
    if (!me) return;
    (async () => {
      const fr = await getFriends(me.id);
      const ids = fr.flatMap((f) => f.participant_ids || []).filter((id) => id !== me.id);
      let chars = await getCharactersByIds(ids);
      const m = await getGuildMembership(me.id);
      if (m) {
        const gms = await api.entities.GuildMember.filter({ guild_id: m.guild_id });
        const gmIds = gms.map((g) => g.character_id).filter((id) => id !== me.id);
        const gmChars = await getCharactersByIds(gmIds);
        const seen = new Set(chars.map((c) => c.id));
        gmChars.forEach((c) => { if (!seen.has(c.id)) chars.push(c); });
      }
      setRecipients(chars);
    })();
  }, [me]);

  async function openMail(m) {
    setSelected(m);
    if (!m.read && m.folder !== "deleted") {
      await markMailRead(m.id, true);
      setMails((prev) => prev.map((x) => (x.id === m.id ? { ...x, read: true } : x)));
    }
  }

  async function claim(m) {
    try {
      const res = await claimMailReward(m.id);
      toast({ title: "Rewards claimed!", description: summarize(res.applied) });
      load();
    } catch (e) {
      toast({ title: "Claim failed", description: e?.response?.data?.error || e.message, variant: "destructive" });
    }
  }

  async function claimAll() {
    const unclaimed = mails.filter((m) => m.has_rewards && !m.claimed && m.folder !== "deleted");
    for (const m of unclaimed) { try { await claimMailReward(m.id); } catch (_) {} }
    toast({ title: "All rewards claimed", description: `${unclaimed.length} mail(s)` });
    load();
  }

  async function handleAcceptInvite(m) {
    try {
      await acceptGuildInvite(me, m);
      toast({ title: "Invite accepted!", description: "You have joined the guild." });
      setSelected(null); load();
    } catch (e) {
      toast({ title: "Could not accept", description: e.message, variant: "destructive" });
    }
  }

  async function handleAcceptRequest(m) {
    try {
      const guild = await api.entities.Guild.get(m.guild_id);
      await acceptGuildRequest(me, guild, m);
      toast({ title: "Request accepted!", description: `${m.from_name} has joined ${guild.name}.` });
      setSelected(null); load();
    } catch (e) {
      toast({ title: "Could not accept", description: e.message, variant: "destructive" });
    }
  }

  async function handleDeclineRequest(m) {
    try {
      await declineGuildRequest(m);
      toast({ title: "Request declined" });
      setSelected(null); load();
    } catch (e) {
      toast({ title: "Could not decline", description: e.message, variant: "destructive" });
    }
  }

  async function handleDeclineInvite(m) {
    try {
      await deleteMail(m.id);
      toast({ title: "Invite declined" });
      setSelected(null); load();
    } catch (e) {
      toast({ title: "Could not decline", description: e.message, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Mail className="w-5 h-5 text-primary" />
        <h1 className="font-display font-bold text-xl tracking-wider">Mail</h1>
        <div className="ml-auto flex gap-2">
          {tab === "inbox" && mails.some((m) => m.has_rewards && !m.claimed) && (
            <button onClick={claimAll} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300"><Gift className="w-3.5 h-3.5" /> Claim All</button>
          )}
          <button onClick={() => setComposing(true)} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg painted-btn"><Plus className="w-3.5 h-3.5" /> Compose</button>
        </div>
      </div>

      <div className="flex gap-1 p-1 rounded-xl bg-muted/20 border border-border/30">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-display font-semibold ${tab === t.key ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-[300px_1fr] gap-3">
        <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
          {mails.length === 0 && <p className="text-center text-xs text-muted-foreground italic py-8">No mail here.</p>}
          {mails.map((m) => (
            <button key={m.id} onClick={() => openMail(m)}
              className={`w-full text-left p-2.5 rounded-xl border ${selected?.id === m.id ? "border-primary/50 bg-primary/10" : "border-border/20 bg-muted/10 hover:border-primary/30"}`}>
              <div className="flex items-center gap-2">
                {!m.read && m.folder !== "deleted" && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                <p className={`text-sm font-display font-semibold truncate flex-1 ${m.read ? "text-foreground/70" : ""}`}>{m.subject}</p>
                {m.has_rewards && !m.claimed && <Gift className="w-3.5 h-3.5 text-amber-300 shrink-0" />}
                {m.claimed && <span className="text-[9px] text-green-400">CLAIMED</span>}
              </div>
              <p className="text-[10px] text-muted-foreground truncate">{m.from_name} · {new Date(m.created_date).toLocaleDateString()}</p>
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-border/30 bg-card/30 p-4 min-h-[200px]">
          {selected ? (
            <MailDetail mail={selected} onClaim={claim} onDelete={async () => { await deleteMail(selected.id); toast({ title: "Moved to Deleted" }); setSelected(null); load(); }}
              onRestore={async () => { await restoreMail(selected.id); toast({ title: "Restored" }); setSelected(null); load(); }}
              onUnread={async () => { await markMailRead(selected.id, false); setSelected(null); load(); }}
              onReply={() => setComposing({ to: selected.from_id, name: selected.from_name, subject: `Re: ${selected.subject}` })}
              onAcceptInvite={() => handleAcceptInvite(selected)}
              onDeclineInvite={() => handleDeclineInvite(selected)}
              onAcceptRequest={() => handleAcceptRequest(selected)}
              onDeclineRequest={() => handleDeclineRequest(selected)} />
          ) : (
            <p className="text-center text-xs text-muted-foreground italic py-12">Select a message to read.</p>
          )}
        </div>
      </div>

      <AnimatePresence>
        {composing && (
          <ComposeSheet recipients={recipients} initial={composing === true ? null : composing}
            onClose={() => setComposing(false)}
            onSend={async (toId, toName, subject, body) => {
              try { await sendPlayerMail(me, toId, toName, subject, body); toast({ title: "Mail sent" }); setComposing(false); load(); }
              catch (e) { toast({ title: "Send failed", description: e.message, variant: "destructive" }); }
            }} />
        )}
      </AnimatePresence>
    </div>
  );
}

function MailDetail({ mail, onClaim, onDelete, onRestore, onUnread, onReply, onAcceptInvite, onDeclineInvite, onAcceptRequest, onDeclineRequest }) {
  const expired = mail.expires_at && new Date(mail.expires_at) < new Date();
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display font-bold text-base">{mail.subject}</h3>
          <p className="text-xs text-muted-foreground">From {mail.from_name} · {new Date(mail.created_date).toLocaleString()}</p>
        </div>
        <span className={`text-[9px] px-2 py-0.5 rounded-full ${mail.mail_type === "system" ? "bg-purple-500/15 text-purple-300" : "bg-cyan-500/15 text-cyan-300"}`}>{mail.mail_type}</span>
      </div>
      <p className="text-sm text-foreground/80 whitespace-pre-wrap">{mail.body}</p>

      {mail.has_rewards && (
        <div className={`p-3 rounded-xl border ${mail.claimed ? "border-green-500/30 bg-green-500/5" : "border-amber-500/40 bg-amber-500/5"}`}>
          <p className="text-xs font-display font-semibold flex items-center gap-1.5"><Gift className="w-3.5 h-3.5 text-amber-300" /> Attached Rewards</p>
          <p className="text-xs text-muted-foreground mt-1">{summarize(mail.rewards)}</p>
          {mail.expires_at && <p className="text-[10px] text-muted-foreground mt-1">Expires: {new Date(mail.expires_at).toLocaleDateString()}{expired ? " (expired)" : ""}</p>}
          {!mail.claimed && !expired && <button onClick={onClaim} className="mt-2 text-xs px-3 py-1.5 rounded-lg painted-btn">Claim Rewards</button>}
          {mail.claimed && <p className="text-[10px] text-green-400 mt-1">✓ Rewards claimed</p>}
        </div>
      )}

      {mail.mail_type === "guild_invite" && mail.guild_id && mail.folder !== "deleted" && (
        <div className="flex gap-2">
          <button onClick={onAcceptInvite} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg painted-btn"><UserPlus className="w-3.5 h-3.5" /> Accept Invite</button>
          <button onClick={onDeclineInvite} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive"><X className="w-3.5 h-3.5" /> Decline</button>
        </div>
      )}
      {mail.mail_type === "guild_request" && mail.guild_id && mail.folder !== "deleted" && (
        <div className="flex gap-2">
          <button onClick={onAcceptRequest} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg painted-btn"><UserCheck className="w-3.5 h-3.5" /> Accept Request</button>
          <button onClick={onDeclineRequest} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive"><X className="w-3.5 h-3.5" /> Decline</button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        {mail.folder === "deleted" ? (
          <button onClick={onRestore} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-muted/30 border border-border/30"><Undo2 className="w-3.5 h-3.5" /> Restore</button>
        ) : (
          <>
            {mail.mail_type === "player" && mail.from_id !== "system" && <button onClick={onReply} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-muted/30 border border-border/30"><Reply className="w-3.5 h-3.5" /> Reply</button>}
            <button onClick={onUnread} className="text-xs px-3 py-1.5 rounded-lg bg-muted/30 border border-border/30">Mark Unread</button>
            <button onClick={onDelete} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
          </>
        )}
      </div>
    </div>
  );
}

function ComposeSheet({ recipients, initial, onClose, onSend }) {
  const [toId, setToId] = useState(initial?.to || "");
  const [subject, setSubject] = useState(initial?.subject || "");
  const [body, setBody] = useState("");
  const toName = recipients.find((r) => r.id === toId)?.name || initial?.name || "";

  return (
    <motion.div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }} className="relative w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-border/60 painted-panel p-5">
        <div className="flex items-center gap-2 mb-3"><Send className="w-4 h-4 text-primary" /><h3 className="font-display font-bold text-sm">Compose Mail</h3><button onClick={onClose} className="ml-auto text-muted-foreground"><X className="w-4 h-4" /></button></div>
        <select value={toId} onChange={(e) => setToId(e.target.value)} className="w-full bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm mb-2 outline-none">
          <option value="">Select recipient...</option>
          {recipients.map((r) => <option key={r.id} value={r.id}>{r.name} (Lv{r.level})</option>)}
        </select>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" maxLength={80} className="w-full bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm mb-2 outline-none focus:border-primary/50" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message..." rows={4} maxLength={1000} className="w-full bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-primary/50 resize-none" />
        <button onClick={() => onSend(toId, toName, subject || "(no subject)", body)} disabled={!toId || !body.trim()}
          className="w-full painted-btn text-sm py-2 rounded-lg disabled:opacity-40">Send Mail</button>
      </motion.div>
    </motion.div>
  );
}

function summarize(rewards) {
  if (!rewards) return "";
  const parts = [];
  if (rewards.stardust) parts.push(`${rewards.stardust} Stardust`);
  if (rewards.nova_crystals) parts.push(`${rewards.nova_crystals} Nova Crystals`);
  if (rewards.fuel) parts.push(`${rewards.fuel} Energy`);
  if (rewards.item_rarity) parts.push(`${rewards.item_rarity} Equipment`);
  if (rewards.collectible) parts.push(rewards.collectible.name);
  return parts.join(" · ") || "—";
}
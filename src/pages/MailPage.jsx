import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import { api } from "@/api/gameClient";
import { useToast } from "@/components/ui/use-toast";
import {
  getMail,
  sendPlayerMail,
  claimMailReward,
  markMailRead,
  deleteMail,
  restoreMail,
} from "@/lib/mailEngine";
import { getFriends, getCharactersByIds, getMyCharacter, primeMyCharacterCache } from "@/lib/socialEngine";
import { getGuildMembership, acceptGuildInvite, acceptGuildRequest, declineGuildRequest } from "@/lib/guildUtils";
import { Gift, Plus, Send, X, Satellite } from "lucide-react";
import PageStage from "@/components/game/PageStage";
import { MailFolderBar, MailCategoryChips } from "@/components/social/MailNav";
import MailListItem from "@/components/social/MailListItem";
import MailReader from "@/components/social/MailReader";
import { filterMailsByCategory, summarizeRewards } from "@/lib/mailUi";

const PANEL_STYLE = {
  borderColor: "hsl(190 40% 40% / 0.28)",
  background: `
    linear-gradient(165deg, hsl(222 26% 11% / 0.92), hsl(230 30% 7% / 0.96)),
    repeating-linear-gradient(0deg, transparent, transparent 11px, hsl(190 40% 50% / 0.02) 11px, hsl(190 40% 50% / 0.02) 12px)
  `,
  boxShadow: "0 14px 36px rgba(0,0,0,0.26), inset 0 1px 0 hsl(190 60% 60% / 0.07)",
};

export default function MailPage() {
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState("inbox");
  const [category, setCategory] = useState("all");
  const [mails, setMails] = useState([]);
  const [selected, setSelected] = useState(null);
  const [composing, setComposing] = useState(false);
  const [recipients, setRecipients] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  const load = useCallback(async () => {
    if (!me) return;
    const list = await getMail(me.id, tab);
    setMails(list);
    setSelected((prev) => {
      if (!prev) return null;
      const next = list.find((m) => m.id === prev.id);
      return next || null;
    });
  }, [me, tab]);

  useEffect(() => {
    getMyCharacter().then((c) => setMe(c || null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setCategory("all");
    setSelected(null);
  }, [tab]);

  useEffect(() => {
    const to = String(searchParams.get("to") || "").trim();
    if (!to) return;
    setComposing({
      to,
      name: searchParams.get("name") || "Player",
      level: Number(searchParams.get("level") || 1) || 1,
      subject: "",
    });
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

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
        gmChars.forEach((c) => {
          if (!seen.has(c.id)) chars.push(c);
        });
      }
      setRecipients(chars);
    })();
  }, [me]);

  const filtered = useMemo(() => {
    if (tab !== "inbox") return mails;
    return filterMailsByCategory(mails, category);
  }, [mails, tab, category]);

  const unreadCount = useMemo(
    () => mails.filter((m) => !m.read && m.folder !== "deleted").length,
    [mails]
  );

  async function openMail(m) {
    setSelected(m);
    if (!m.read && m.folder !== "deleted") {
      await markMailRead(m.id, true);
      setMails((prev) => prev.map((x) => (x.id === m.id ? { ...x, read: true } : x)));
      setSelected((prev) => (prev?.id === m.id ? { ...prev, read: true } : prev));
    }
  }

  async function claim(m) {
    const res = await claimMailReward(m.id);
    const patch = res?.applied || res?.patch || {};
    if (me && Object.keys(patch).length) {
      const next = { ...me, ...patch };
      primeMyCharacterCache(next);
      setMe(next);
    }
    toast({ title: "Rewards claimed!", description: summarizeRewards(res.applied || m.rewards) });
    await load();
  }

  async function claimAll() {
    const unclaimed = mails.filter((m) => m.has_rewards && !m.claimed && m.folder !== "deleted");
    for (const m of unclaimed) {
      try {
        await claimMailReward(m.id);
      } catch (_) {
        /* continue */
      }
    }
    if (unclaimed.length) {
      const fresh = await getMyCharacter({ force: true });
      if (fresh) {
        primeMyCharacterCache(fresh);
        setMe(fresh);
      }
    }
    toast({ title: "All rewards claimed", description: `${unclaimed.length} transmission(s)` });
    load();
  }

  async function handleAcceptInvite(m) {
    try {
      await acceptGuildInvite(me, m);
      toast({ title: "Invite accepted!", description: "You have joined the guild." });
      setSelected(null);
      load();
    } catch (e) {
      toast({ title: "Could not accept", description: e.message, variant: "destructive" });
    }
  }

  async function handleAcceptRequest(m) {
    try {
      const guild = await api.entities.Guild.get(m.guild_id);
      await acceptGuildRequest(me, guild, m);
      toast({ title: "Request accepted!", description: `${m.from_name} has joined ${guild.name}.` });
      setSelected(null);
      load();
    } catch (e) {
      toast({ title: "Could not accept", description: e.message, variant: "destructive" });
    }
  }

  async function handleDeclineRequest(m) {
    try {
      await declineGuildRequest(m);
      toast({ title: "Request declined" });
      setSelected(null);
      load();
    } catch (e) {
      toast({ title: "Could not decline", description: e.message, variant: "destructive" });
    }
  }

  async function handleDeclineInvite(m) {
    try {
      await deleteMail(m.id);
      toast({ title: "Invite declined" });
      setSelected(null);
      load();
    } catch (e) {
      toast({ title: "Could not decline", description: e.message, variant: "destructive" });
    }
  }

  if (!me) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const showClaimAll = tab === "inbox" && mails.some((m) => m.has_rewards && !m.claimed);

  return (
    <PageStage className="gap-4 min-h-0">
      <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 shrink-0">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center border shrink-0"
            style={{
              borderColor: "hsl(40 70% 50% / 0.4)",
              background: "linear-gradient(160deg, hsl(40 60% 35% / 0.35), hsl(220 30% 14% / 0.6))",
              boxShadow: "0 0 20px hsl(40 90% 50% / 0.15)",
            }}
          >
            <Satellite className="w-5 h-5 text-amber-300" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display font-bold text-xl sm:text-2xl tracking-wider text-foreground/95">
              Galactic Message Terminal
            </h1>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Interstellar mail network · transmissions & packages
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showClaimAll && (
            <button
              type="button"
              onClick={claimAll}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 transition-colors font-display font-semibold"
            >
              <Gift className="w-3.5 h-3.5" /> Claim All
            </button>
          )}
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl painted-btn font-display font-semibold"
          >
            <Plus className="w-3.5 h-3.5" /> Compose
          </button>
        </div>
      </header>

      <MailFolderBar
        active={tab}
        onChange={setTab}
        counts={tab === "inbox" ? { inbox: unreadCount } : {}}
      />

      <MailCategoryChips
        visible={tab === "inbox"}
        active={category}
        onChange={setCategory}
      />

      <div
        className="grid sm:grid-cols-[minmax(260px,340px)_1fr] gap-3 flex-1 min-h-0"
        style={{ minHeight: "min(68vh, 620px)" }}
      >
        {/* Transmission list */}
        <div
          className={`mail-terminal rounded-2xl border overflow-hidden flex flex-col min-h-0 ${
            selected ? "hidden sm:flex" : "flex"
          }`}
          style={PANEL_STYLE}
        >
          <div
            className="px-3.5 py-2.5 border-b shrink-0 flex items-center justify-between"
            style={{ borderColor: "hsl(190 30% 40% / 0.2)" }}
          >
            <p className="text-[10px] font-display tracking-[0.18em] text-muted-foreground uppercase">
              Incoming transmissions
            </p>
            <span className="text-[10px] tabular-nums text-muted-foreground/70">
              {filtered.length}
            </span>
          </div>

          <div className="mail-scroll flex-1 overflow-y-auto min-h-0 p-2 space-y-2">
            {filtered.length === 0 && (
              <EmptyInbox folder={tab} category={category} />
            )}
            {filtered.map((m, i) => (
              <MailListItem
                key={m.id}
                mail={m}
                index={i}
                selected={selected?.id === m.id}
                onOpen={openMail}
              />
            ))}
          </div>
        </div>

        {/* Reader */}
        <div
          className={`mail-terminal rounded-2xl border overflow-hidden flex flex-col min-h-0 ${
            !selected ? "hidden sm:flex" : "flex"
          }`}
          style={PANEL_STYLE}
        >
          {selected ? (
            <MailReader
              mail={selected}
              onBack={() => setSelected(null)}
              onClaim={claim}
              onDelete={async () => {
                await deleteMail(selected.id);
                toast({ title: "Moved to Deleted" });
                setSelected(null);
                load();
              }}
              onRestore={async () => {
                await restoreMail(selected.id);
                toast({ title: "Restored" });
                setSelected(null);
                load();
              }}
              onUnread={async () => {
                await markMailRead(selected.id, false);
                setSelected(null);
                load();
              }}
              onReply={() =>
                setComposing({
                  to: selected.from_id,
                  name: selected.from_name,
                  subject: `Re: ${selected.subject}`,
                })
              }
              onAcceptInvite={() => handleAcceptInvite(selected)}
              onDeclineInvite={() => handleDeclineInvite(selected)}
              onAcceptRequest={() => handleAcceptRequest(selected)}
              onDeclineRequest={() => handleDeclineRequest(selected)}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 border"
                style={{
                  borderColor: "hsl(190 50% 45% / 0.3)",
                  background: "hsl(190 40% 20% / 0.2)",
                }}
              >
                <Satellite className="w-6 h-6 text-cyan-300/70" />
              </div>
              <p className="font-display font-semibold text-sm text-foreground/90 mb-1">
                Select a transmission
              </p>
              <p className="text-xs text-muted-foreground max-w-[15rem] leading-relaxed">
                Open a message from the left to read, claim packages, or reply across the galaxy.
              </p>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {composing && (
          <ComposeSheet
            recipients={recipients}
            initial={composing === true ? null : composing}
            onClose={() => setComposing(false)}
            onSend={async (toId, toName, subject, body) => {
              try {
                await sendPlayerMail(me, toId, toName, subject, body);
                toast({ title: "Transmission sent" });
                setComposing(false);
                load();
              } catch (e) {
                toast({ title: "Send failed", description: e.message, variant: "destructive" });
              }
            }}
          />
        )}
      </AnimatePresence>
    </PageStage>
  );
}

function EmptyInbox({ folder, category }) {
  const quiet =
    folder === "inbox" && category === "all"
      ? "Galactic communications are quiet… for now."
      : "No incoming transmissions in this channel.";
  return (
    <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 border relative"
        style={{
          borderColor: "hsl(190 40% 45% / 0.3)",
          background: "hsl(220 25% 12% / 0.6)",
          boxShadow: "0 0 32px hsl(190 90% 50% / 0.08)",
        }}
      >
        <div
          className="absolute inset-2 rounded-xl border border-dashed opacity-40"
          style={{ borderColor: "hsl(190 50% 50% / 0.4)" }}
        />
        <Satellite className="w-7 h-7 text-cyan-300/60 relative z-[1]" />
      </div>
      <p className="font-display font-semibold text-sm text-foreground/85 mb-1">
        No incoming transmissions
      </p>
      <p className="text-xs text-muted-foreground max-w-[14rem] leading-relaxed">{quiet}</p>
    </div>
  );
}

function ComposeSheet({ recipients, initial, onClose, onSend }) {
  const mergedRecipients = useMemo(() => {
    const list = Array.isArray(recipients) ? [...recipients] : [];
    if (initial?.to && !list.some((r) => r.id === initial.to)) {
      list.unshift({
        id: initial.to,
        name: initial.name || "Player",
        level: initial.level || 1,
      });
    }
    return list;
  }, [recipients, initial]);

  const [toId, setToId] = useState(initial?.to || "");
  const [subject, setSubject] = useState(initial?.subject || "");
  const [body, setBody] = useState("");
  const toName = mergedRecipients.find((r) => r.id === toId)?.name || initial?.name || "";

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ y: 40, opacity: 0.9 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        className="relative w-full max-w-md rounded-t-2xl sm:rounded-2xl border p-5"
        style={{
          borderColor: "hsl(190 40% 40% / 0.4)",
          background: "linear-gradient(165deg, hsl(222 28% 12% / 0.98), hsl(230 32% 8% / 0.99))",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5), 0 0 28px hsl(190 90% 50% / 0.1)",
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center border"
            style={{
              borderColor: "hsl(190 50% 45% / 0.4)",
              background: "hsl(190 40% 25% / 0.3)",
            }}
          >
            <Send className="w-3.5 h-3.5 text-cyan-300" />
          </div>
          <h3 className="font-display font-bold text-sm tracking-wide">Compose Transmission</h3>
          <button type="button" onClick={onClose} className="ml-auto p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5">
            <X className="w-4 h-4" />
          </button>
        </div>
        <select
          value={toId}
          onChange={(e) => setToId(e.target.value)}
          className="w-full bg-muted/30 border border-border/40 rounded-xl px-3 py-2.5 text-sm mb-2 outline-none focus:border-cyan-400/50"
        >
          <option value="">Select recipient…</option>
          {mergedRecipients.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} (Lv{r.level})
            </option>
          ))}
        </select>
        {mergedRecipients.length === 0 && !initial?.to && (
          <p className="text-[11px] text-muted-foreground mb-2">
            Open a player from Rankings or their profile and tap Mail to write them.
          </p>
        )}
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          maxLength={80}
          className="w-full bg-muted/30 border border-border/40 rounded-xl px-3 py-2.5 text-sm mb-2 outline-none focus:border-cyan-400/50"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Message…"
          rows={4}
          maxLength={1000}
          className="w-full bg-muted/30 border border-border/40 rounded-xl px-3 py-2.5 text-sm mb-3 outline-none focus:border-cyan-400/50 resize-none"
        />
        <button
          type="button"
          onClick={() => onSend(toId, toName, subject || "(no subject)", body)}
          disabled={!toId || !body.trim()}
          className="w-full painted-btn text-sm py-2.5 rounded-xl disabled:opacity-40 font-display font-semibold"
        >
          Send Transmission
        </button>
      </motion.div>
    </motion.div>
  );
}

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, UserPlus, MessageSquare, Ban, Flag, Shield, Users } from "lucide-react";
import CharacterStats from "@/components/game/CharacterStats";
import EquipmentSlots from "@/components/game/EquipmentSlots";
import CharacterAvatar from "@/components/game/CharacterAvatar";
import { api } from "@/api/gameClient";
import { presenceStatus } from "@/hooks/usePresence";
import { useToast } from "@/components/ui/use-toast";
import { getGuildMembership, invitePlayerToGuild } from "@/lib/guildUtils";
import { sendFriendRequest, getFriends, getOutgoingRequests } from "@/lib/socialEngine";
import { profileDisplayName, normalizeLegacyDisplay, LEGACY_DISPLAY_FAMILY } from "@/lib/legacyName";

export default function PublicProfileSheet({ target, myChar, onClose, onMessage, onBlock, onReport, friendStatus = "none" }) {
  const [guildTag, setGuildTag] = useState("");
  const [presence, setPresence] = useState(null);
  const [equipped, setEquipped] = useState([]);
  const [myMembership, setMyMembership] = useState(null);
  const [myGuild, setMyGuild] = useState(null);
  const [targetInGuild, setTargetInGuild] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [invited, setInvited] = useState(false);
  const [friendState, setFriendState] = useState(friendStatus || "none");
  const [sendingFriend, setSendingFriend] = useState(false);
  const { toast } = useToast();

  // Check whether our guild already has a pending invite out to this player.
  // Called once myGuild is known so the button shows "Pending" on reopen.
  useEffect(() => {
    if (!myGuild?.id || !target?.id) return;
    let active = true;
    api.entities.Mail.filter({
      owner_id: target.id,
      mail_type: "guild_invite",
      guild_id: myGuild.id,
      folder: "inbox",
    }).then((mails) => {
      if (active && mails.length > 0) setInvited(true);
    }).catch(() => {});
    return () => { active = false; };
  }, [myGuild?.id, target?.id]);

  useEffect(() => {
    let active = true;
    api.entities.GuildMember.filter({ character_id: target.id })
      .then((m) => { if (!active) return; if (m[0]) { setTargetInGuild(true); return api.entities.Guild.get(m[0].guild_id); } setTargetInGuild(false); })
      .then((g) => { if (active && g) setGuildTag(g.tag || ""); })
      .catch(() => {});
    api.entities.PlayerPresence.filter({ character_id: target.id })
      .then((p) => active && setPresence(p[0] || null));
    api.entities.Item.filter({ character_id: target.id, is_equipped: true })
      .then((items) => active && setEquipped(items || []))
      .catch(() => {});
    return () => { active = false; };
  }, [target.id]);

  // Load the viewer's guild so leaders/officers can send invites from the profile.
  useEffect(() => {
    if (!myChar?.id) return;
    let active = true;
    getGuildMembership(myChar.id)
      .then(async (m) => {
        if (!active) return;
        setMyMembership(m);
        if (m && (m.role === "leader" || m.role === "officer")) {
          const g = await api.entities.Guild.get(m.guild_id).catch(() => null);
          if (active && g) setMyGuild(g);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, [myChar?.id]);

  const canInvite =
    !!myGuild &&
    !targetInGuild &&
    target.id !== myChar?.id &&
    (myMembership?.role === "leader" || myMembership?.role === "officer");

  async function handleGuildInvite() {
    if (!myChar || !myGuild) return;
    setInviting(true);
    try {
      await invitePlayerToGuild(myChar, myGuild, target);
      setInvited(true);
      toast({ title: `Guild invite sent to ${target.name}` });
    } catch (e) {
      toast({ title: "Could not send invite", description: e.message, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  }

  // Resolve the real friendship state so the "Add Friend" option is hidden for
  // players you're already friends with (and shows "Pending" for outgoing reqs).
  useEffect(() => {
    if (!myChar?.id || !target?.id || myChar.id === target.id) { setFriendState("none"); return; }
    let active = true;
    (async () => {
      try {
        const [friends, outg] = await Promise.all([getFriends(myChar.id), getOutgoingRequests(myChar.id)]);
        if (!active) return;
        const isFriend = friends.some((f) => (f.participant_ids || []).includes(target.id));
        if (isFriend) { setFriendState("friends"); return; }
        setFriendState(outg.some((r) => r.to_character_id === target.id) ? "pending" : "none");
      } catch {}
    })();
    return () => { active = false; };
  }, [myChar?.id, target?.id]);

  async function handleAddFriend() {
    if (!myChar || !target) return;
    setSendingFriend(true);
    try {
      await sendFriendRequest(myChar, target);
      setFriendState("pending");
      toast({ title: "Friend request sent", description: `To ${target.name}` });
    } catch (e) {
      toast({ title: "Could not send", description: e.message, variant: "destructive" });
    } finally {
      setSendingFriend(false);
    }
  }

  const status = presenceStatus(presence);
  const statusColor = status === "online" ? "#34D399" : status === "in_mission" ? "#FBBF24" : "#6B7280";

  return (
    <motion.div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 360, damping: 26 }}
        className="relative w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-border/60 painted-panel canvas-grain p-5"
      >
        <button onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>

        <div className="flex items-center gap-3">
          <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-primary/40 bg-muted/30"
            style={{ boxShadow: "0 0 10px hsl(190 90% 50% / 0.25)" }}>
            <CharacterAvatar
              race={target.race}
              skinColor={target.appearance?.skin_color}
              eyeStyle={target.appearance?.eye_style}
              ears={target.appearance?.ears}
              mouth={target.appearance?.mouth}
              nose={target.appearance?.nose}
              eyebrows={target.appearance?.eyebrows}
              marking={target.appearance?.marking}
              cls={target.class}
              size={64}
            />
            <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-card" style={{ background: statusColor }} />
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-bold text-lg truncate flex items-center gap-1.5">
              {profileDisplayName(target)}
              {target.active_title && <span className="text-[11px] text-amber-300/90 font-display">「{target.active_title}」</span>}
            </h3>
            {normalizeLegacyDisplay(target.legacy_display) === LEGACY_DISPLAY_FAMILY && target.legacy_name && target.name && (
              <p className="text-[11px] text-muted-foreground/80">Operative {target.name}</p>
            )}
            <p className="text-xs text-muted-foreground">Lv {target.level || 1} · {target.class}{guildTag ? ` · [${guildTag}]` : ""}</p>
            <p className="text-[10px] mt-0.5" style={{ color: statusColor }}>
              {status === "online" ? "● Online" : status === "in_mission" ? "● In Mission" : "○ Offline"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4 text-center">
          <Mini label="Rating" value={target.arena_rating || 1000} />
          <Mini label="Wins" value={target.arena_wins || 0} />
          <Mini label="Losses" value={target.arena_losses || 0} />
        </div>

        <div className="mt-3">
          <CharacterStats character={target} hideStardust />
        </div>

        <div className="mt-3">
          <p className="text-[10px] font-display tracking-wide text-muted-foreground mb-1.5">EQUIPPED GEAR</p>
          <EquipmentSlots equippedItems={equipped} />
        </div>

        {target.bio && (
          <p className="text-xs text-foreground/70 italic mt-3 p-2 rounded-lg bg-muted/15 border border-border/20">"{target.bio}"</p>
        )}

        <div className="grid grid-cols-2 gap-2 mt-4">
          {target.id !== myChar?.id && (
            <>
              <Action icon={MessageSquare} label="Message" color="#22D3EE" onClick={() => onMessage?.(target)} />
              {friendState === "none" && (
                <Action icon={UserPlus} label={sendingFriend ? "Sending…" : "Add Friend"} color="#A855F7" onClick={handleAddFriend} />
              )}
              {friendState === "pending" && <Action icon={Shield} label="Pending" color="#6B7280" onClick={() => {}} />}
              {friendState === "friends" && <Action icon={Shield} label="Friends" color="#34D399" onClick={() => {}} />}
              {canInvite && !invited && (
                <Action icon={Users} label={inviting ? "Sending…" : "Guild Invite"} color="#A855F7" onClick={handleGuildInvite} />
              )}
              {canInvite && invited && <Action icon={Shield} label="Pending" color="#6B7280" onClick={() => {}} />}
              <Action icon={Ban} label="Block" color="#EF4444" onClick={() => onBlock?.(target)} />
              <Action icon={Flag} label="Report" color="#F59E0B" onClick={() => onReport?.(target)} />
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function Mini({ label, value }) {
  return (
    <div className="p-2 rounded-lg bg-muted/15 border border-border/20">
      <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="font-display font-bold text-xs truncate">{value}</p>
    </div>
  );
}

function Action({ icon: Icon, label, color, onClick }) {
  return (
    <button onClick={onClick} className="flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-muted/20 border border-border/30 hover:border-primary/40 transition-colors">
      <Icon className="w-3.5 h-3.5" style={{ color }} />
      <span>{label}</span>
    </button>
  );
}
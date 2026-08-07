import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Globe, Lock, RadioTower } from "lucide-react";
import { getMyCharacter } from "@/lib/socialEngine";
import { listNotifications } from "@/lib/notificationEngine";
import PrivateChatPanel from "@/components/social/PrivateChatPanel";
import GlobalChatPanel from "@/components/social/GlobalChatPanel";
import PublicProfileSheet from "@/components/social/PublicProfileSheet";
import ChatChannelBar from "@/components/social/ChatChannelBar";
import PageStage from "@/components/game/PageStage";

export default function MessagesPage() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const to = sp.get("to");
  const [me, setMe] = useState(null);
  const [profile, setProfile] = useState(null);
  const [dmUnread, setDmUnread] = useState(0);
  // Deep-link ?to= opens DMs; otherwise Global is the main chat surface.
  const [tab, setTab] = useState(to ? "dm" : "global");

  useEffect(() => {
    getMyCharacter().then(setMe);
  }, []);

  useEffect(() => {
    if (to) setTab("dm");
  }, [to]);

  useEffect(() => {
    let active = true;
    listNotifications({ unreadOnly: true, limit: 100 })
      .then((items) => {
        if (!active) return;
        const n = (items || []).filter((x) => x.type === "private_message").length;
        setDmUnread(n);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [tab]);

  const channels = useMemo(
    () => [
      {
        id: "global",
        label: "Global",
        sublabel: "Open",
        icon: Globe,
      },
      {
        id: "dm",
        label: "Private",
        sublabel: "Secure",
        icon: Lock,
        unread: dmUnread,
      },
    ],
    [dmUnread]
  );

  function openProfileFromChat(msgOrChar) {
    if (!msgOrChar) return;
    const id = msgOrChar.sender_id || msgOrChar.id;
    if (!id || id === me.id) return;
    setProfile({
      id,
      name: msgOrChar.sender_name || msgOrChar.name || "Pilot",
      level: msgOrChar.sender_level || msgOrChar.level || 1,
      class: msgOrChar.sender_class || msgOrChar.class,
      race: msgOrChar.race,
      avatar_url: msgOrChar.sender_avatar_url || msgOrChar.avatar_url,
      appearance: msgOrChar.appearance,
    });
  }

  if (!me) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <PageStage className="gap-4 min-h-0">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 shrink-0">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center border shrink-0"
            style={{
              borderColor: "hsl(190 70% 50% / 0.4)",
              background: "linear-gradient(160deg, hsl(190 60% 35% / 0.35), hsl(220 30% 14% / 0.6))",
              boxShadow: "0 0 20px hsl(190 90% 50% / 0.18)",
            }}
          >
            <RadioTower className="w-5 h-5 text-cyan-300" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display font-bold text-xl sm:text-2xl tracking-wider text-foreground/95">
              Comms Terminal
            </h1>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Station frequencies · encrypted private links
            </p>
          </div>
        </div>

        <ChatChannelBar
          channels={channels}
          activeId={tab}
          onChange={(id) => {
            setTab(id);
            if (id === "global" && to) {
              navigate("/messages", { replace: true });
            }
          }}
        />
      </header>

      <div className="flex-1 min-h-0 flex flex-col">
        {tab === "global" ? (
          <GlobalChatPanel
            variant="page"
            myChar={me}
            onTagSender={openProfileFromChat}
            onWhisper={(msg) => {
              if (!msg?.sender_id || msg.sender_id === me.id) return;
              setTab("dm");
              navigate(`/messages?to=${encodeURIComponent(msg.sender_id)}`, { replace: true });
            }}
          />
        ) : (
          <PrivateChatPanel
            embedded
            myChar={me}
            initialRecipientId={to}
            onTagSender={openProfileFromChat}
          />
        )}
      </div>

      {profile && (
        <PublicProfileSheet
          target={profile}
          myChar={me}
          onClose={() => setProfile(null)}
          onMessage={(t) => {
            setProfile(null);
            setTab("dm");
            navigate(`/messages?to=${encodeURIComponent(t.id)}`, { replace: true });
          }}
          onMail={(t) => {
            setProfile(null);
            const name = encodeURIComponent(t.name || "Player");
            navigate(`/mail?to=${encodeURIComponent(t.id)}&name=${name}&level=${t.level || 1}`);
          }}
        />
      )}
    </PageStage>
  );
}

import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { getMyCharacter } from "@/lib/socialEngine";
import PrivateChatPanel from "@/components/social/PrivateChatPanel";
import PublicProfileSheet from "@/components/social/PublicProfileSheet";
import NotificationsTab from "@/components/social/NotificationsTab";
import { MessageSquare, Bell } from "lucide-react";

export default function MessagesPage() {
  const [sp] = useSearchParams();
  const to = sp.get("to");
  const [me, setMe] = useState(null);
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState("messages");

  useEffect(() => { getMyCharacter().then(setMe); }, []);

  if (!me) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <TabButton active={tab === "messages"} onClick={() => setTab("messages")} icon={MessageSquare} label="Messages" />
        <TabButton active={tab === "notifications"} onClick={() => setTab("notifications")} icon={Bell} label="Notifications" />
      </div>
      {tab === "messages" ? (
        <PrivateChatPanel myChar={me} initialRecipientId={to} onTagSender={setProfile} />
      ) : (
        <NotificationsTab myChar={me} />
      )}
      {profile && <PublicProfileSheet target={profile} myChar={me} onClose={() => setProfile(null)} />}
    </>
  );
}

function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-display text-sm tracking-wide transition-colors ${
        active ? "border-primary bg-primary/10 text-primary border-glow-cyan" : "border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/30"
      }`}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}
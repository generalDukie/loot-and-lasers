import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { getMyCharacter } from "@/lib/socialEngine";
import PrivateChatPanel from "@/components/social/PrivateChatPanel";
import PublicProfileSheet from "@/components/social/PublicProfileSheet";

export default function MessagesPage() {
  const [sp] = useSearchParams();
  const to = sp.get("to");
  const [me, setMe] = useState(null);
  const [profile, setProfile] = useState(null);

  useEffect(() => { getMyCharacter().then(setMe); }, []);

  if (!me) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  return (
    <>
      <PrivateChatPanel myChar={me} initialRecipientId={to} onTagSender={setProfile} />
      {profile && <PublicProfileSheet target={profile} myChar={me} onClose={() => setProfile(null)} />}
    </>
  );
}

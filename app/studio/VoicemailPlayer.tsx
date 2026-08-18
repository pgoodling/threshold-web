"use client";

import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { supabase } from "../../lib/supabase";

// Plays a voicemail. Used in the Messages thread and on the appointment detail.
//
// The transcript is the message body everywhere this appears, so audio is the
// fallback rather than the main event — for the times the transcription mangles
// a name, or where hearing that someone is upset matters more than the words.
//
// It's fetched rather than linked because /api/voice/recording needs her session
// token in a header, which an <audio src> can't send. Nothing downloads until
// she asks for it.

export function voicemailLength(seconds: number | null): string {
  if (!seconds) return "";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function VoicemailPlayer({
  sid,
  seconds,
}: {
  sid: string;
  seconds: number | null;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // The blob stays alive only as long as the player is on screen.
  useEffect(
    () => () => {
      if (src) URL.revokeObjectURL(src);
    },
    [src],
  );

  async function load() {
    setLoading(true);
    setFailed(false);
    const { data: sess } = await supabase.auth.getSession();
    const res = await fetch(`/api/voice/recording?sid=${sid}`, {
      headers: { Authorization: `Bearer ${sess.session?.access_token ?? ""}` },
    });
    setLoading(false);
    if (!res.ok) {
      setFailed(true);
      return;
    }
    setSrc(URL.createObjectURL(await res.blob()));
  }

  if (src) {
    return <audio src={src} controls autoPlay className="mb-1 w-full max-w-xs" />;
  }

  const length = voicemailLength(seconds);

  return (
    <button
      onClick={load}
      disabled={loading}
      className="mb-1 flex items-center gap-2 text-accent-dark disabled:opacity-60"
    >
      <Play className="h-4 w-4" />
      <span className="text-xs">
        {failed
          ? "Couldn't load the recording"
          : loading
            ? "Loading…"
            : `Play${length ? ` · ${length}` : ""}`}
      </span>
    </button>
  );
}

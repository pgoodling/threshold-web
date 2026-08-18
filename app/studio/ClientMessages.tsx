"use client";

import { useEffect, useState } from "react";
import { Mic } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { whenLabel } from "../../lib/format";
import VoicemailPlayer from "./VoicemailPlayer";

// What this client has said recently, shown on the appointment detail.
//
// The Messages tab is where she goes to have a conversation. This is for the
// other moment: she's opened an appointment to check the time or the formula,
// and needs to know — without going looking — that the client texted "running
// 10 late" an hour ago, or left a voicemail asking to bring her daughter.
//
// Deliberately does not mark anything read. She's glancing at an appointment,
// not answering; clearing the badge from here would hide a message she hasn't
// dealt with yet.

type Line = {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  created_at: string;
  read_at: string | null;
  kind: "sms" | "voicemail" | null;
  recording_sid: string | null;
  recording_seconds: number | null;
};

const LIMIT = 3;

export default function ClientMessages({ clientId }: { clientId: string }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    supabase
      .from("messages")
      .select(
        "id,direction,body,created_at,read_at,kind,recording_sid,recording_seconds",
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(LIMIT)
      .then(({ data }) => {
        if (!active) return;
        setLines((data ?? []) as unknown as Line[]);
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [clientId]);

  // Nothing to say is the common case — stay out of the way entirely rather
  // than adding an empty heading to every appointment she opens.
  if (!loaded || lines.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="text-xs uppercase tracking-wide text-muted">
        Recent messages
      </p>
      <div className="mt-2 grid gap-1.5">
        {/* Oldest first, so it reads like a conversation. */}
        {[...lines].reverse().map((m) => {
          const unread = m.direction === "inbound" && !m.read_at;
          return (
            <div
              key={m.id}
              style={{
                borderLeftColor:
                  m.direction === "outbound"
                    ? "#e8e0d6"
                    : unread
                      ? "#a32d2d"
                      : "#c9b8a8",
                borderLeftWidth: 3,
              }}
              className="rounded-lg bg-foreground/[0.03] px-3 py-2"
            >
              {m.kind === "voicemail" && m.recording_sid && (
                <VoicemailPlayer
                  sid={m.recording_sid}
                  seconds={m.recording_seconds}
                />
              )}
              <p className="text-sm">
                {m.direction === "outbound" && (
                  <span className="text-muted">You: </span>
                )}
                {m.body}
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
                {m.kind === "voicemail" && <Mic className="h-3 w-3" />}
                {whenLabel(m.created_at)}
                {unread && <span className="text-accent-dark">· unread</span>}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

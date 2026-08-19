"use client";

import { useCallback, useEffect, useState } from "react";
import { Mic, PhoneMissed } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { whenLabel } from "../../lib/format";
import VoicemailPlayer from "./VoicemailPlayer";
import Button from "./Button";

// The running conversation with this client, on her own record.
//
// This is where a CRM keeps it: her texts, voicemails and missed calls belong in
// her file next to her formula and her visits, not in a separate inbox she has
// to cross-reference. The Messages tab is the list of what still wants a reply;
// this is the conversation itself.
//
// On the appointment detail it stays collapsed to the last few lines, because
// she opened an appointment, not a conversation.

type Line = {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  created_at: string;
  read_at: string | null;
  kind: "sms" | "voicemail" | "missed_call" | null;
  recording_sid: string | null;
  recording_seconds: number | null;
};

export default function ClientMessages({
  clientId,
  phone,
  /** Collapsed to the last few lines, read-only — for the appointment detail. */
  compact = false,
}: {
  clientId: string;
  phone?: string | null;
  compact?: boolean;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    supabase
      .from("messages")
      .select(
        "id,direction,body,created_at,read_at,kind,recording_sid,recording_seconds",
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(compact ? 3 : 200)
      .then(({ data }) => {
        setLines((data ?? []) as unknown as Line[]);
        setLoaded(true);
      });
  }, [clientId, compact]);

  useEffect(load, [load]);

  async function markRead() {
    const unread = lines
      .filter((m) => m.direction === "inbound" && !m.read_at)
      .map((m) => m.id);
    if (!unread.length) return;
    await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", unread);
    load();
  }

  async function send() {
    if (!phone || !reply.trim()) return;
    setSending(true);
    setError(null);
    const { data: sess } = await supabase.auth.getSession();
    const res = await fetch("/api/sms/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sess.session?.access_token ?? ""}`,
      },
      body: JSON.stringify({ to: phone, body: reply.trim(), clientId }),
    });
    const json = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setError(json.error || "Couldn't send the text.");
      return;
    }
    setReply("");
    load();
  }

  // Nothing said yet is the common case on the appointment detail — stay out of
  // the way rather than adding an empty heading to every appointment she opens.
  if (!loaded || (compact && lines.length === 0)) return null;

  const unreadCount = lines.filter(
    (m) => m.direction === "inbound" && !m.read_at,
  ).length;

  // Newest at the top, older pushed down.
  //
  // A chat app puts the newest at the bottom because it scrolls itself there.
  // This sits inside a page that doesn't, so oldest-first meant scrolling past
  // a year of history to find what just arrived — the one thing she opened the
  // client to read.
  const ordered = compact ? [...lines].reverse() : lines;

  return (
    <div className={compact ? "mt-4" : "mt-6"}>
      <div className="flex items-baseline justify-between gap-3">
        <h3
          className={
            compact
              ? "text-xs uppercase tracking-wide text-muted"
              : "font-display text-lg"
          }
        >
          {compact ? "Recent messages" : "Conversation"}
        </h3>
        {!compact && unreadCount > 0 && (
          <Button variant="quiet" onClick={markRead}>
            Mark {unreadCount} read
          </Button>
        )}
      </div>

      {/* Above the thread, because the thread runs newest-first — a reply box
          under a year of history would never be on screen. */}
      {!compact && phone && (
        <div className="mt-3 flex items-end gap-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={2}
            placeholder="Type a reply…"
            className="input flex-1"
          />
          <Button onClick={send} disabled={sending || !reply.trim()}>
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-accent-dark">{error}</p>}

      {lines.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          Nothing yet. Texts and voicemails from her number land here.
        </p>
      ) : (
        <div className="mt-2 flex w-full flex-col gap-2 overflow-x-hidden">
          {ordered.map((m) => {
            const unread = m.direction === "inbound" && !m.read_at;
            return (
              <div
                key={m.id}
                className={`max-w-[85%] break-words rounded-xl px-3.5 py-2 text-sm ${
                  m.direction === "inbound"
                    ? "self-start bg-foreground/5"
                    : "self-end bg-accent text-white"
                }`}
                style={
                  unread
                    ? { boxShadow: "inset 3px 0 0 var(--accent)" }
                    : undefined
                }
              >
                {m.kind === "voicemail" && m.recording_sid && (
                  <VoicemailPlayer
                    sid={m.recording_sid}
                    seconds={m.recording_seconds}
                  />
                )}
                <p>{m.body}</p>
                <p
                  className={`mt-0.5 flex items-center gap-1 text-[11px] ${
                    m.direction === "inbound" ? "text-muted" : "text-white/70"
                  }`}
                >
                  {m.kind === "voicemail" && <Mic className="h-3 w-3" />}
                  {m.kind === "missed_call" && <PhoneMissed className="h-3 w-3" />}
                  {whenLabel(m.created_at)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

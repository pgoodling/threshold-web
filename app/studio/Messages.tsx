"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, Mic, PhoneMissed } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { whenLabel, shortWhen } from "../../lib/format";
import VoicemailPlayer from "./VoicemailPlayer";
import Button from "./Button";

type Msg = {
  id: string;
  client_id: string | null;
  appointment_id: string | null;
  direction: "inbound" | "outbound";
  body: string;
  from_number: string | null;
  created_at: string;
  read_at: string | null;
  kind: "sms" | "voicemail" | "missed_call" | null;
  recording_sid: string | null;
  recording_seconds: number | null;
  archived_at: string | null;
  clients: { full_name: string; phone: string | null } | null;
};

type Convo = {
  key: string;
  name: string;
  phone: string | null;
  clientId: string | null;
  appointmentId: string | null;
  list: Msg[];
  unread: number;
  lastAt: string;
  /** Archived only when nothing in it is still live. */
  archived: boolean;
};

// The inbox, not the archive.
//
// Most CRMs keep the conversation on the record it belongs to, and that's the
// right instinct here: a client's texts are part of her file, alongside her
// formula and her visits. So tapping a known client opens her profile, where the
// running conversation lives. Only numbers we can't match to anyone open a
// thread here, because there's no record to put them on.
export default function Messages({
  onOpenClient,
}: {
  onOpenClient?: (clientId: string) => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(() => {
    supabase
      .from("messages")
      .select("*,clients(full_name,phone)")
      .order("created_at", { ascending: true })
      .limit(1000)
      .then(({ data, error }) => {
        setLoading(false);
        if (error) setError(error.message);
        else setMsgs((data ?? []) as unknown as Msg[]);
      });
  }, []);

  // Archive stamps every message in the conversation. A conversation isn't a
  // row anywhere — it's messages grouped by client — so this is what "the
  // conversation" means. A new message arrives unarchived, which is why the
  // thread comes back on its own when they next get in touch.
  async function setArchived(c: Convo, archived: boolean) {
    const ids = c.list.map((m) => m.id);
    if (!ids.length) return;
    const now = new Date().toISOString();

    const { error } = await supabase
      .from("messages")
      .update({ archived_at: archived ? now : null })
      .in("id", ids);
    if (error) {
      setError(error.message);
      return;
    }

    // Archiving is her saying she's dealt with it, so it marks read too.
    //
    // These were separate before, and separate is wrong: archiving from the
    // list without opening the thread left read_at null, the badge counts
    // unread, and the inbox hides archived — so the count stayed at 1 with
    // nothing behind it to click. Unarchiving deliberately does NOT undo this;
    // putting a thread back in the inbox shouldn't resurrect a notification for
    // a message she's already seen.
    if (archived) {
      const unreadIds = c.list
        .filter((m) => m.direction === "inbound" && !m.read_at)
        .map((m) => m.id);
      if (unreadIds.length) {
        await supabase
          .from("messages")
          .update({ read_at: now })
          .in("id", unreadIds);
      }
    }

    load();
  }
  useEffect(load, [load]);

  const convos = useMemo(() => {
    const map = new Map<string, Convo>();
    for (const m of msgs) {
      const key = m.client_id ?? m.from_number ?? "unknown";
      const e =
        map.get(key) ??
        ({
          key,
          name: m.clients?.full_name ?? m.from_number ?? "Unknown number",
          phone: m.clients?.phone ?? m.from_number ?? null,
          clientId: m.client_id,
          appointmentId: null,
          list: [],
          unread: 0,
          lastAt: m.created_at,
          archived: true,
        } as Convo);
      e.list.push(m);
      e.lastAt = m.created_at;
      if (m.appointment_id) e.appointmentId = m.appointment_id;
      if (m.direction === "inbound" && !m.read_at) e.unread += 1;
      // One live message is enough to bring the whole conversation back.
      if (!m.archived_at) e.archived = false;
      map.set(key, e);
    }
    return [...map.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  }, [msgs]);

  const visible = convos.filter((c) => c.archived === showArchived);

  const totalUnread = convos.reduce((s, c) => s + c.unread, 0);
  const open = convos.find((c) => c.key === openKey) ?? null;

  async function openConvo(c: Convo) {
    setOpenKey(c.key);
    setError(null);
    const unreadIds = c.list
      .filter((m) => m.direction === "inbound" && !m.read_at)
      .map((m) => m.id);
    if (unreadIds.length) {
      await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .in("id", unreadIds);
      load();
    }
  }

  async function send() {
    if (!open || !open.phone || !reply.trim()) return;
    setSending(true);
    setError(null);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    const res = await fetch("/api/sms/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token ?? ""}`,
      },
      body: JSON.stringify({
        to: open.phone,
        body: reply.trim(),
        clientId: open.clientId,
        appointmentId: open.appointmentId,
      }),
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

  if (loading) return <p className="text-muted">Loading messages…</p>;

  if (msgs.length === 0) {
    return (
      <div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <p className="text-muted">
          No messages yet. When clients text your Threshold number — or leave a
          voicemail — it shows up here, and you can reply right from this page.
        </p>
      </div>
    );
  }

  // Thread view
  if (open) {
    return (
      <div>
        <button
          onClick={() => setOpenKey(null)}
          className="text-sm text-muted hover:text-accent"
        >
          ← All messages
        </button>
        <div className="mt-3 flex items-baseline justify-between">
          <h3 className="font-display text-lg">{open.name}</h3>
          {open.phone && (
            <a href={`tel:${open.phone}`} className="text-sm text-accent">
              {open.phone}
            </a>
          )}
        </div>

        {/* A flex column with per-bubble alignment, and words that break.
            The old grid let a long unbroken string — a phone number, a link —
            push a bubble past its max width and the whole page with it. */}
        <div className="mt-4 flex w-full flex-col gap-2 overflow-x-hidden">
          {open.list.map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] break-words rounded-xl px-4 py-2 text-sm ${
                m.direction === "inbound"
                  ? "self-start bg-foreground/5 text-foreground"
                  : "self-end bg-accent text-white"
              }`}
            >
              {m.kind === "voicemail" && m.recording_sid && (
                <VoicemailPlayer
                  sid={m.recording_sid}
                  seconds={m.recording_seconds}
                />
              )}
              <p>{m.body}</p>
              <p
                className={`mt-1 text-[11px] ${
                  m.direction === "inbound" ? "text-muted" : "text-white/70"
                }`}
              >
                {whenLabel(m.created_at)}
              </p>
            </div>
          ))}
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        {open.phone ? (
          <div className="mt-5 flex items-end gap-2">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={2}
              placeholder="Type a reply…"
              className="input flex-1"
            />
            <button
              onClick={send}
              disabled={sending || !reply.trim()}
              className="rounded-md bg-accent px-5 py-2.5 text-sm text-white transition hover:bg-accent-dark disabled:opacity-60"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        ) : (
          <p className="mt-5 text-sm text-muted">
            No phone number on file to reply to.
          </p>
        )}
      </div>
    );
  }

  // Conversation list
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl leading-none sm:text-3xl">
            {showArchived ? "Archived" : "Inbox"}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {showArchived
              ? "Conversations she's finished with. A new message brings one back on its own."
              : "Texts, voicemail and missed calls from your Threshold number."}
            {totalUnread > 0 && !showArchived && (
              <span className="ml-2 font-medium text-accent-dark">
                {totalUnread} unread
              </span>
            )}
          </p>
        </div>
        <Button variant="quiet" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? "Back to inbox" : "Archived"}
        </Button>
      </div>
      {/* One surface with hairline dividers, and an accent rail on anything
          unread — the same shape as the client list. */}
      <div className="mt-4 overflow-hidden rounded-xl border border-foreground/15 bg-white">
        {visible.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted">
            {showArchived
              ? "Nothing archived."
              : "Nothing waiting. Everything's been dealt with."}
          </p>
        )}
        {visible.map((c, i) => {
          const last = c.list[c.list.length - 1];
          return (
            <div
              key={c.key}
              className={`flex w-full items-stretch transition hover:bg-background/60 ${
                i > 0 ? "border-t border-foreground/10" : ""
              }`}
            >
            <button
              onClick={() =>
                c.clientId && onOpenClient
                  ? onOpenClient(c.clientId)
                  : openConvo(c)
              }
              className="flex min-w-0 flex-1 items-stretch text-left"
            >
              <span
                aria-hidden="true"
                className="w-1 shrink-0 self-stretch"
                style={{
                  background: c.unread > 0 ? "var(--accent)" : "transparent",
                }}
              />
              <span className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                    {last.kind === "voicemail" && (
                      <Mic className="h-3 w-3 shrink-0" />
                    )}
                    {last.kind === "missed_call" && (
                      <PhoneMissed className="h-3 w-3 shrink-0" />
                    )}
                    <span className="truncate">
                      {last.direction === "outbound" && "You: "}
                      {last.body}
                    </span>
                  </span>
                </span>
                {/* When it landed, always — an unread count instead of a time
                    left her unable to tell an hour ago from last month. */}
                <span className="ml-auto shrink-0 whitespace-nowrap text-right">
                  <span className="block text-xs text-muted">
                    {shortWhen(c.lastAt)}
                  </span>
                  {c.unread > 0 && (
                    <span className="mt-0.5 block text-[11px] font-medium text-accent-dark">
                      {c.unread} new
                    </span>
                  )}
                </span>
              </span>
            </button>
            <button
              onClick={() => setArchived(c, !c.archived)}
              aria-label={c.archived ? "Move back to inbox" : "Archive"}
              title={c.archived ? "Move back to inbox" : "Archive"}
              className="shrink-0 px-4 text-muted transition hover:text-accent-dark"
            >
              {c.archived ? (
                <ArchiveRestore className="h-4 w-4" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
            </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 rounded-xl border border-accent-dark/30 bg-accent/5 px-4 py-3 text-sm text-accent-dark">
      {children}
    </p>
  );
}

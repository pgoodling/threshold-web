"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  parseSettings,
  SETTINGS_DEFAULTS,
  type SalonSettings,
} from "../../lib/settings";

// Everything about how the studio runs when she isn't looking at it.
//
// Every control here used to be a constant in a file she couldn't open — the
// cancellation window, quiet hours, the reminder lookahead, what counts as
// short notice. They were decisions about her salon that only Paul could make.
//
// The rule the page has to keep: a control that doesn't do anything is worse
// than no control. So nothing appears here unless the value is actually read
// where it matters. The digest hour is the reason the digest job moved to
// pg_cron — a Vercel schedule is fixed at deploy, and a time picker over it
// would have been a lie.
//
// Working hours sit at the top because they're what she'll open this page for
// most. Time off deliberately stays where it is for now; blocking a Thursday
// afternoon belongs on the calendar she's looking at, not behind Settings.
//
// NOT HERE, ON PURPOSE: an on/off switch for the late-arrival text. It's the
// obvious thing to add once a settings page exists, and it was considered and
// declined on 10 Sep 2026. The reason that feature was removed (see migration
// 0032_stop_late_arrival_texts) wasn't that she was unsure — it's that an
// automatic "are you on your way?" at ten past assumes a stylist who can't see
// the door, and in a one-chair studio she can. That's a fact about her room,
// not a preference. Restoring it as a switch would mean carrying a route, a
// five-minutely cron job, a message template and an A2P campaign sample
// permanently for something switched off. A conditional want is a setting;
// "that's not how my room works" isn't. It's in git history if she ever asks.

type Draft = SalonSettings;

const HOURS_12 = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  label:
    h === 0
      ? "12:00 AM"
      : h < 12
        ? `${h}:00 AM`
        : h === 12
          ? "12:00 PM"
          : `${h - 12}:00 PM`,
}));

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-foreground/15 bg-white">
      <p className="border-b border-foreground/10 px-4 py-2.5 text-xs uppercase tracking-[0.09em] text-muted">
        {title}
      </p>
      {children}
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 border-t border-foreground/10 px-4 py-3 first-of-type:border-t-0">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2">{children}</span>
    </div>
  );
}

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition ${
        on ? "bg-accent" : "bg-foreground/20"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white transition-all ${
          on ? "left-[18px]" : "left-[2px]"
        }`}
      />
    </button>
  );
}

function Num({
  value,
  onChange,
  unit,
  min,
  max,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  min: number;
  max: number;
  label: string;
}) {
  return (
    <>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        aria-label={label}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="input w-20 text-center tabular-nums"
      />
      {unit && <span className="text-xs text-muted">{unit}</span>}
    </>
  );
}

export default function Settings({ onGoto }: { onGoto?: (tab: string) => void }) {
  const [draft, setDraft] = useState<Draft>(SETTINGS_DEFAULTS);
  const [saved, setSaved] = useState<Draft>(SETTINGS_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    supabase
      .from("salon_settings")
      .select("*")
      .maybeSingle()
      .then(({ data, error }) => {
        setLoading(false);
        if (error) {
          setError(error.message);
          return;
        }
        const parsed = parseSettings(data as Record<string, unknown> | null);
        setDraft(parsed);
        setSaved(parsed);
      });
  }, []);

  useEffect(load, [load]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  async function save() {
    setBusy(true);
    setError(null);
    setNote(null);
    const { error } = await supabase
      .from("salon_settings")
      .update({
        digest_enabled: draft.digestEnabled,
        digest_hour: draft.digestHour,
        digest_include_money: draft.digestIncludeMoney,
        booking_alert_enabled: draft.bookingAlertEnabled,
        booking_alert_hours: draft.bookingAlertHours,
        sms_automation_enabled: draft.smsAutomationEnabled,
        confirmations_enabled: draft.confirmationsEnabled,
        reminders_enabled: draft.remindersEnabled,
        reminder_lookahead_hours: draft.reminderLookaheadHours,
        quiet_start_hour: draft.quietStartHour,
        quiet_end_hour: draft.quietEndHour,
        cancel_notice_hours: draft.cancelNoticeHours,
        min_booking_notice_minutes: draft.minBookingNoticeMinutes,
        max_booking_days_ahead: draft.maxBookingDaysAhead,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSaved(draft);
    setNote("Saved.");
  }

  if (loading) return <p className="text-muted">Loading settings…</p>;

  return (
    <div className="max-w-2xl">
      <h2 className="font-display text-2xl leading-none sm:text-3xl">Settings</h2>
      <p className="mt-2 text-sm text-muted">
        How the studio runs when you&apos;re not looking at it.
      </p>

      {error && (
        <p className="mt-4 rounded-xl border border-[#8f3f4a]/35 bg-[#8f3f4a]/5 px-4 py-3 text-sm text-[#8f3f4a]">
          {error}
        </p>
      )}

      <div className="mt-6 grid gap-4">
        {/* Top, because it's what she opens this page for. */}
        <Group title="Your hours">
          <Row
            label="Working hours"
            hint="Which days you're open, and when. Clients can only book inside these."
          >
            <button
              onClick={() => onGoto?.("hours")}
              className="text-sm text-accent hover:underline"
            >
              Edit →
            </button>
          </Row>
          <Row
            label="Time off"
            hint="Holidays, a course, a dentist appointment — anything you don't want bookable."
          >
            <button
              onClick={() => onGoto?.("timeoff")}
              className="text-sm text-accent hover:underline"
            >
              Edit →
            </button>
          </Row>
        </Group>

        <Group title="Your morning email">
          <Row
            label="Send me my day"
            hint="The whole schedule, in the email — it works even if the site is down."
          >
            <Toggle
              on={draft.digestEnabled}
              onChange={(v) => set("digestEnabled", v)}
              label="Send my daily schedule email"
            />
          </Row>
          <Row label="Arrives at" hint="Give or take a few minutes.">
            <select
              value={draft.digestHour}
              aria-label="Time the daily email arrives"
              onChange={(e) => set("digestHour", Number(e.target.value))}
              className="input w-32"
            >
              {HOURS_12.map((h) => (
                <option key={h.value} value={h.value}>
                  {h.label}
                </option>
              ))}
            </select>
          </Row>
          <Row
            label="Include expected takings"
            hint="The day's total, if you'd rather not see it first thing."
          >
            <Toggle
              on={draft.digestIncludeMoney}
              onChange={(v) => set("digestIncludeMoney", v)}
              label="Include expected takings"
            />
          </Row>
        </Group>

        <Group title="When someone books">
          <Row
            label="Text me about short-notice bookings"
            hint="To your mobile, the moment it happens."
          >
            <Toggle
              on={draft.bookingAlertEnabled}
              onChange={(v) => set("bookingAlertEnabled", v)}
              label="Text me about short-notice bookings"
            />
          </Row>
          <Row
            label="Short notice means within"
            hint="Anything further out waits on your home screen instead."
          >
            <Num
              value={draft.bookingAlertHours}
              onChange={(v) => set("bookingAlertHours", v)}
              unit="hours"
              min={1}
              max={168}
              label="Short notice window in hours"
            />
          </Row>
        </Group>

        <Group title="Booking rules">
          <Row
            label="Clients can't book less than"
            hint="Stops someone taking a three-hour colour twenty minutes from now."
          >
            <Num
              value={Math.round(draft.minBookingNoticeMinutes / 60)}
              onChange={(v) => set("minBookingNoticeMinutes", v * 60)}
              unit="hours ahead"
              min={0}
              max={336}
              label="Minimum booking notice in hours"
            />
          </Row>
          <Row
            label="Free cancellation up to"
            hint="Clients are told this when they book. Changing it won't change what anyone was already promised."
          >
            <Num
              value={draft.cancelNoticeHours}
              onChange={(v) => set("cancelNoticeHours", v)}
              unit="hours before"
              min={0}
              max={168}
              label="Free cancellation window in hours"
            />
          </Row>
          <Row
            label="Clients can book up to"
            hint="Keeps next spring off your calendar."
          >
            <Num
              value={Math.round(draft.maxBookingDaysAhead / 7)}
              onChange={(v) => set("maxBookingDaysAhead", v * 7)}
              unit="weeks out"
              min={1}
              max={104}
              label="How far ahead clients can book, in weeks"
            />
          </Row>
        </Group>

        <Group title="What clients get">
          <Row
            label="Automated texts"
            hint="Master switch. Off means confirmations and reminders both stop."
          >
            <Toggle
              on={draft.smsAutomationEnabled}
              onChange={(v) => set("smsAutomationEnabled", v)}
              label="Automated texts"
            />
          </Row>
          <Row
            label="Booking confirmations"
            hint="Sent the moment someone books."
          >
            <Toggle
              on={draft.confirmationsEnabled}
              onChange={(v) => set("confirmationsEnabled", v)}
              label="Booking confirmations"
            />
          </Row>
          <Row
            label="Day-before reminders"
            hint="Sent each morning, to everyone due soon."
          >
            <Toggle
              on={draft.remindersEnabled}
              onChange={(v) => set("remindersEnabled", v)}
              label="Day-before reminders"
            />
          </Row>
          <Row
            label="Reminders look ahead"
            hint="How far forward the morning sweep reaches. 36 hours catches tomorrow plus tonight's late bookings."
          >
            <Num
              value={draft.reminderLookaheadHours}
              onChange={(v) => set("reminderLookaheadHours", v)}
              unit="hours"
              min={1}
              max={168}
              label="Reminder lookahead in hours"
            />
          </Row>
          <Row
            label="Never text before or after"
            hint="Applies to anything automatic. Replies you send by hand are always yours to time."
          >
            <select
              value={draft.quietStartHour}
              aria-label="Earliest hour an automated text may go out"
              onChange={(e) => set("quietStartHour", Number(e.target.value))}
              className="input w-28"
            >
              {HOURS_12.map((h) => (
                <option key={h.value} value={h.value}>
                  {h.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted">–</span>
            <select
              value={draft.quietEndHour}
              aria-label="Latest hour an automated text may go out"
              onChange={(e) => set("quietEndHour", Number(e.target.value))}
              className="input w-28"
            >
              {HOURS_12.map((h) => (
                <option key={h.value} value={h.value}>
                  {h.label}
                </option>
              ))}
            </select>
          </Row>
        </Group>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          onClick={save}
          disabled={busy || !dirty}
          className="rounded-full bg-accent px-6 py-2.5 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <span className="text-xs text-muted">
          {note ??
            (dirty
              ? "Unsaved changes."
              : "Changes apply to new bookings, not ones already made.")}
        </span>
      </div>
    </div>
  );
}

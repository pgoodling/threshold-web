"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import { ChoiceRow, ChoiceList } from "../../Choice";
import {
  HAIR_TYPE,
  STRAND,
  DENSITY,
  LENGTH,
  LAST_CUT,
  STRUGGLES,
} from "../../../lib/hairNotes";

// "Tell me about your hair" — offered after booking, never before it.
//
// Optional in every direction: no question is required, the whole form can be
// skipped, and a half-answered one is still worth having. Nothing here stands
// between a client and a confirmed appointment, which is why it lives on its
// own page rather than as a fifth step in the booking flow.
//
// The client is anonymous — they've just booked and have no account. What
// protects this is the appointment id in the URL, which is an unguessable v4
// UUID, the same thing that protects the booking confirmation.

const MAX_PHOTOS = 3;

export default function HairNotesForm({
  appointmentId,
  clientId,
  firstName,
  when,
}: {
  appointmentId: string;
  clientId: string | null;
  firstName: string;
  /** "Friday, September 11 at 2:00 PM" — reassurance, not a form field. */
  when?: string | null;
}) {
  const [hairType, setHairType] = useState<string | null>(null);
  const [strand, setStrand] = useState<string | null>(null);
  const [density, setDensity] = useState<string | null>(null);
  const [length, setLength] = useState<string | null>(null);
  const [lastCut, setLastCut] = useState<string | null>(null);
  const [struggles, setStruggles] = useState<string[]>([]);
  const [allergies, setAllergies] = useState("");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);

    const { error: err } = await supabase.from("appointment_intake").upsert(
      {
        appointment_id: appointmentId,
        client_id: clientId,
        hair_type: hairType,
        strand,
        density,
        length,
        last_cut: lastCut,
        struggles,
        allergies: allergies.trim() || null,
        note: note.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "appointment_id" },
    );

    if (err) {
      setBusy(false);
      setError("Something went wrong saving that. Please try again.");
      return;
    }

    // Photos are best-effort: the answers are already saved, and a failed
    // upload shouldn't lose them or leave her staring at an error.
    for (const [i, file] of photos.entries()) {
      const ext = file.name.split(".").pop() ?? "jpg";
      await supabase.storage
        .from("booking-photos")
        .upload(`${appointmentId}/${Date.now()}-${i}.${ext}`, file, {
          upsert: false,
        });
    }

    setBusy(false);
    setDone(true);
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg px-6 py-20 text-center">
        <h1 className="font-display text-3xl">Thank you</h1>
        <p className="mt-3 text-muted">
          Evelyn will read this before you come in. See you soon.
        </p>
        <Link href="/" className="mt-8 inline-block text-accent-dark underline decoration-accent underline-offset-4">
          Back to the website
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-12">
      {/* The appointment is safe. Say so first and plainly — someone arriving
          here from a confirmation email needs to know nothing is outstanding
          before they'll read anything else. */}
      <div className="flex items-start gap-3 rounded-xl border border-foreground/15 bg-white p-4">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent"
        >
          ✓
        </span>
        <p className="text-sm">
          <span className="font-medium">
            {firstName}, your appointment is booked.
          </span>{" "}
          <span className="text-muted">
            {when ? `${when}. ` : ""}Nothing else is needed.
          </span>
        </p>
      </div>

      <h1 className="mt-8 font-display text-3xl">Tell me about your hair</h1>
      <p className="mt-2 text-muted">
        This part is optional — but it&apos;s the difference between me guessing
        and me being ready for you. A minute of questions and a photo or two
        means we spend your appointment on your hair instead of on questions.
      </p>

      <div className="mt-8 grid gap-7">
        <ChoiceRow
          label="Hair type"
          options={HAIR_TYPE}
          value={hairType}
          onChange={setHairType}
        />
        <ChoiceRow
          label="How does a single strand feel?"
          help="Fine like thread, or thick like fishing line?"
          options={STRAND}
          value={strand}
          onChange={setStrand}
        />
        <ChoiceRow
          label="How much hair do you have?"
          options={DENSITY}
          value={density}
          onChange={setDensity}
        />
        <ChoiceRow
          label="How long is it?"
          options={LENGTH}
          value={length}
          onChange={setLength}
        />
        <ChoiceList
          label="What are you struggling with most?"
          help="Pick as many as you like."
          options={STRUGGLES}
          values={struggles}
          onChange={setStruggles}
        />
        <ChoiceRow
          label="When was your last cut?"
          options={LAST_CUT}
          value={lastCut}
          onChange={setLastCut}
        />

        <div>
          <label className="block">
            <span className="text-sm font-medium">
              Any allergies or sensitivities?
            </span>
            <span className="mt-0.5 block text-xs text-muted">
              Especially if you&apos;ve ever reacted to hair colour.
            </span>
            <input
              className="input mt-2"
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              placeholder="Nothing I know of"
            />
          </label>
        </div>

        <div>
          <p className="text-sm font-medium">Photos</p>
          <p className="mt-0.5 text-xs text-muted">
            Your hair now, or anything you&apos;re inspired by. Up to {MAX_PHOTOS}.
          </p>
          {photos.length > 0 && (
            <ul className="mt-2 grid gap-1">
              {photos.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="flex items-center gap-3 rounded-md border border-foreground/15 bg-white px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                    className="shrink-0 text-xs text-muted hover:text-accent-dark"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          {photos.length < MAX_PHOTOS && (
            <label className="mt-2 block cursor-pointer rounded-md border border-dashed border-foreground/25 px-4 py-5 text-center text-sm text-muted hover:border-accent hover:text-accent-dark">
              Add a photo
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  setPhotos((p) => [...p, ...picked].slice(0, MAX_PHOTOS));
                }}
              />
            </label>
          )}
        </div>

        <label className="block">
          <span className="text-sm font-medium">
            Anything you&apos;d like to tell me?
          </span>
          <textarea
            className="input mt-2"
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What you're hoping for, what you didn't love last time, anything at all."
          />
        </label>
      </div>

      {error && <p className="mt-5 text-sm text-accent-dark">{error}</p>}

      <div className="mt-8 flex items-center gap-5">
        <button
          onClick={submit}
          disabled={busy}
          className="rounded-md bg-accent px-6 py-2.5 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-60"
        >
          {busy ? "Sending…" : "Send to Evelyn"}
        </button>
        <Link href="/" className="text-sm text-muted hover:text-accent-dark">
          Skip this
        </Link>
      </div>
    </div>
  );
}

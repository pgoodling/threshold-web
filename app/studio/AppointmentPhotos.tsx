"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

// Lists and displays the photos a client uploaded for an appointment.
// Photos live in the private `booking-photos` bucket under the appointment id.
export default function AppointmentPhotos({
  appointmentId,
}: {
  appointmentId: string;
}) {
  const [urls, setUrls] = useState<string[] | null>(null);
  const [zoomed, setZoomed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.storage
        .from("booking-photos")
        .list(appointmentId, { limit: 10 });
      if (error || !data) {
        if (!cancelled) setUrls([]);
        return;
      }
      const files = data.filter((f) => f.id && !f.name.startsWith("."));
      if (files.length === 0) {
        if (!cancelled) setUrls([]);
        return;
      }
      const signed = await Promise.all(
        files.map((f) =>
          supabase.storage
            .from("booking-photos")
            .createSignedUrl(`${appointmentId}/${f.name}`, 3600),
        ),
      );
      if (!cancelled)
        setUrls(
          signed
            .map((s) => s.data?.signedUrl)
            .filter((u): u is string => Boolean(u)),
        );
    })();
    return () => {
      cancelled = true;
    };
  }, [appointmentId]);

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomed(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed]);

  if (urls === null)
    return <p className="mt-2 text-xs text-muted">Loading photos…</p>;
  if (urls.length === 0)
    return <p className="mt-2 text-xs text-muted">No photos uploaded.</p>;

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {urls.map((u, i) => (
          <button
            key={u}
            type="button"
            onClick={() => setZoomed(u)}
            aria-label={`Enlarge client photo ${i + 1}`}
            className="rounded-lg"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={u}
              alt={`Client photo ${i + 1}`}
              className="h-24 w-24 cursor-zoom-in rounded-lg object-cover transition hover:opacity-90"
            />
          </button>
        ))}
      </div>

      {zoomed && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/70 p-4"
          onClick={() => setZoomed(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            aria-label="Close photo"
            className="absolute right-4 top-4 text-2xl leading-none text-white/90 hover:text-white"
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomed}
            alt="Client photo enlarged"
            className="max-h-full max-w-full cursor-zoom-out rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
    </>
  );
}

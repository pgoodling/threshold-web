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

  if (urls === null)
    return <p className="mt-2 text-xs text-muted">Loading photos…</p>;
  if (urls.length === 0)
    return <p className="mt-2 text-xs text-muted">No photos uploaded.</p>;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {urls.map((u, i) => (
        <a key={u} href={u} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={u}
            alt={`Client photo ${i + 1}`}
            className="h-24 w-24 rounded-lg object-cover transition hover:opacity-90"
          />
        </a>
      ))}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import Button from "./Button";

// What the website says she does — the `site_services` table.
//
// Kept apart from the bookable services on purpose. Those carry durations,
// processing time, deposits and categories that the calendar and the overlap
// rules depend on; renaming one rewrites appointment history. This is a shop
// window: longer copy, "from $105" rather than a real price, and the freedom to
// advertise something she doesn't take online bookings for.
//
// Before this, the homepage list was a hardcoded array only a deploy could
// change, and it had already drifted out of step with the database wording.

type SiteService = {
  id: string;
  name: string;
  description: string;
  price_label: string | null;
  sort_order: number;
  active: boolean;
};

type Draft = { name: string; description: string; price_label: string };
const BLANK: Draft = { name: "", description: "", price_label: "" };

export default function WebsiteServices() {
  const [rows, setRows] = useState<SiteService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(BLANK);

  const load = useCallback(() => {
    setLoading(true);
    supabase
      .from("site_services")
      .select("id,name,description,price_label,sort_order,active")
      .order("sort_order")
      .then(({ data, error: err }) => {
        setLoading(false);
        if (err) setUnavailable(true);
        else setRows((data ?? []) as SiteService[]);
      });
  }, []);

  useEffect(load, [load]);

  async function save(id: string | null) {
    if (!draft.name.trim()) return;
    const patch = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      price_label: draft.price_label.trim() || null,
    };
    const { error: err } = id
      ? await supabase.from("site_services").update(patch).eq("id", id)
      : await supabase
          .from("site_services")
          .insert({ ...patch, sort_order: rows.length + 1 });
    if (err) {
      setError(err.message);
      return;
    }
    setEditing(null);
    setAdding(false);
    setDraft(BLANK);
    load();
  }

  // Hidden rather than deleted: taking something off the page is usually
  // seasonal, and she shouldn't have to retype the copy to put it back.
  async function setActive(s: SiteService, active: boolean) {
    const { error: err } = await supabase
      .from("site_services")
      .update({ active })
      .eq("id", s.id);
    if (err) setError(err.message);
    else load();
  }

  // Swap sort_order with the neighbour, so the page order is hers.
  async function move(s: SiteService, delta: number) {
    const ordered = [...rows].sort((a, b) => a.sort_order - b.sort_order);
    const i = ordered.findIndex((x) => x.id === s.id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ordered.length) return;
    await Promise.all([
      supabase
        .from("site_services")
        .update({ sort_order: ordered[j].sort_order })
        .eq("id", ordered[i].id),
      supabase
        .from("site_services")
        .update({ sort_order: ordered[i].sort_order })
        .eq("id", ordered[j].id),
    ]);
    load();
  }

  if (unavailable) {
    return (
      <p className="mt-4 rounded-xl border border-foreground/10 bg-white px-4 py-3 text-sm text-muted">
        Run migration 0027_site_services.sql to edit the website service list.
      </p>
    );
  }

  if (loading) return <p className="mt-4 text-muted">Loading…</p>;

  return (
    <div className="mt-4">
      {error && (
        <p className="mb-3 text-sm text-accent-dark">{error}</p>
      )}

      <div className="overflow-hidden rounded-xl border border-foreground/15 bg-white">
        {rows.map((s, i) => (
          <div
            key={s.id}
            className={`px-4 py-3 ${i > 0 ? "border-t border-foreground/10" : ""} ${
              s.active ? "" : "bg-background/50"
            }`}
          >
            {editing === s.id ? (
              <CopyForm
                draft={draft}
                setDraft={setDraft}
                onSave={() => save(s.id)}
                onCancel={() => {
                  setEditing(null);
                  setDraft(BLANK);
                }}
              />
            ) : (
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span
                      className={s.active ? "font-medium" : "font-medium text-muted"}
                    >
                      {s.name}
                    </span>
                    {s.price_label && (
                      <span className="text-sm text-accent">{s.price_label}</span>
                    )}
                    {!s.active && (
                      <span className="text-[11px] uppercase tracking-wider text-muted">
                        Hidden
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted">{s.description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs">
                  <button
                    onClick={() => move(s, -1)}
                    aria-label={`Move ${s.name} up`}
                    className="text-muted transition hover:text-accent-dark"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(s, 1)}
                    aria-label={`Move ${s.name} down`}
                    className="text-muted transition hover:text-accent-dark"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => {
                      setAdding(false);
                      setEditing(s.id);
                      setDraft({
                        name: s.name,
                        description: s.description,
                        price_label: s.price_label ?? "",
                      });
                    }}
                    className="text-accent-dark underline decoration-accent underline-offset-4"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setActive(s, !s.active)}
                    className="text-muted transition hover:text-accent-dark"
                  >
                    {s.active ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {adding && (
          <div className="border-t border-foreground/10 bg-background/50 px-4 py-3">
            <CopyForm
              draft={draft}
              setDraft={setDraft}
              onSave={() => save(null)}
              onCancel={() => {
                setAdding(false);
                setDraft(BLANK);
              }}
            />
          </div>
        )}
      </div>

      {!adding && (
        <div className="mt-4">
          <Button
            variant="quiet"
            onClick={() => {
              setEditing(null);
              setDraft(BLANK);
              setAdding(true);
            }}
          >
            + Add a service to the website
          </Button>
        </div>
      )}
    </div>
  );
}

function CopyForm({
  draft,
  setDraft,
  onSave,
  onCancel,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-3">
        <label className="block flex-1">
          <span className="mb-1 block text-sm">Name</span>
          <input
            className="input"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm">Price shown</span>
          <input
            className="input w-40"
            placeholder="from $105"
            value={draft.price_label}
            onChange={(e) => setDraft({ ...draft, price_label: e.target.value })}
          />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm">Description</span>
        <textarea
          className="input"
          rows={3}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </label>
      <div className="flex items-center gap-3">
        <Button onClick={onSave}>Save</Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

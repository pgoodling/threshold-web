import type { SupabaseClient } from "@supabase/supabase-js";

// Ticking a task off, in one place.
//
// This used to live inside the To-do tab, which was fine while that was the only
// place she could tick something. The Overview can now too, and a recurrence
// rule implemented twice is a recurrence rule that will eventually disagree with
// itself — a weekly task that quietly stops recurring depending on which screen
// she ticked it from.

export type CompletableTask = {
  id: string;
  title: string;
  start_date: string | null;
  due_date: string | null;
  recurrence: string | null;
  client_id: string | null;
};

// The next occurrence of a repeating task, or null when it doesn't repeat.
export function nextDue(from: string | null, recurrence: string): string | null {
  const base = from ? new Date(`${from}T12:00:00`) : new Date();
  if (recurrence === "weekly") base.setDate(base.getDate() + 7);
  else if (recurrence === "biweekly") base.setDate(base.getDate() + 14);
  else if (recurrence === "monthly") base.setMonth(base.getMonth() + 1);
  else return null;
  return base.toISOString().slice(0, 10);
}

// Mark it done, and for a repeating task create the next one first.
//
// Next-one-first is deliberate: if the insert fails, she still has the original
// sitting there rather than a repeating task that silently stopped repeating.
export async function completeTask(
  supabase: SupabaseClient,
  t: CompletableTask,
): Promise<{ error: string | null }> {
  const recurrence = t.recurrence ?? "none";

  if (recurrence !== "none") {
    const { error } = await supabase.from("tasks").insert({
      title: t.title,
      start_date: nextDue(t.start_date, recurrence),
      due_date: nextDue(t.due_date, recurrence),
      recurrence,
      client_id: t.client_id,
    });
    if (error) return { error: error.message };
  }

  const { error } = await supabase
    .from("tasks")
    .update({ done: true, done_at: new Date().toISOString() })
    .eq("id", t.id);

  return { error: error?.message ?? null };
}

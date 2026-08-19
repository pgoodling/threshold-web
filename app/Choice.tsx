"use client";

// The two option controls, in the studio's language rather than chips.
//
// A row of rounded option chips is a pill by another name, and the whole point
// of the redesign was that colour and shape mean something. So:
//
//   ChoiceRow    one bordered group, hairline-divided, the chosen cell filled.
//                Same shape as the calendar's month/week/day switcher, which is
//                the same job — pick exactly one of a few.
//
//   ChoiceList   a list of rows with a tick box, on one surface. Same shape as
//                every other list in the app, which is what makes it obvious
//                you can pick more than one — a grid of chips never does.

export function ChoiceRow({
  label,
  help,
  options,
  value,
  onChange,
}: {
  label: string;
  help?: string;
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      {help && <p className="mt-0.5 text-xs text-muted">{help}</p>}
      <div className="mt-2 flex overflow-hidden rounded-md border border-foreground/15 bg-white">
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              // Tapping the chosen one again clears it — every answer is
              // optional, so there has to be a way back to unanswered.
              onClick={() => onChange(on ? null : o.value)}
              className={`flex-1 border-l border-foreground/10 px-2 py-2.5 text-xs transition first:border-l-0 ${
                on
                  ? "bg-foreground text-background"
                  : "text-muted hover:bg-background hover:text-foreground"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ChoiceList({
  label,
  help,
  options,
  values,
  onChange,
}: {
  label: string;
  help?: string;
  options: { value: string; label: string }[];
  values: string[];
  onChange: (v: string[]) => void;
}) {
  function toggle(v: string) {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  }

  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      {help && <p className="mt-0.5 text-xs text-muted">{help}</p>}
      <div className="mt-2 overflow-hidden rounded-md border border-foreground/15 bg-white">
        {options.map((o, i) => {
          const on = values.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(o.value)}
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition ${
                i > 0 ? "border-t border-foreground/10" : ""
              } ${on ? "bg-accent/5" : "hover:bg-background"}`}
            >
              <span
                aria-hidden="true"
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                  on
                    ? "border-accent bg-accent text-white"
                    : "border-foreground/25"
                }`}
              >
                {on ? "✓" : ""}
              </span>
              <span className={on ? "font-medium" : ""}>{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

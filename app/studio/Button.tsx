"use client";

// The three button shapes the studio is allowed to have.
//
// Before this there was one shape — a pill — used for everything from "Save" to
// "Call from my phone", which is why every screen read as a row of lozenges with
// no sense of what mattered. Emphasis now comes from weight and colour first,
// shape second, fill last.
//
//   primary  A filled block, 6px radius. Reserved for the one genuine commit
//            action on a view: Book appointment, Save, Add. If a screen has two,
//            one of them is wrong.
//   quiet    Text with an accent underline. Everything optional — opening a
//            form, sending a win-back text, cancelling out of something.
//   ghost    Bare text, muted. Navigation and dismissal, where a control that
//            looked clickable would compete with the content.
//
// Card-level actions (call, text, edit, book) don't belong here at all — they
// live in ActionStrip, one divided band flush to the card edge.

type Variant = "primary" | "quiet" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary:
    "rounded-md bg-accent px-5 py-2 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-60",
  quiet:
    "text-sm font-medium text-accent-dark underline decoration-accent underline-offset-4 transition hover:decoration-accent-dark disabled:opacity-60",
  ghost:
    "text-sm text-muted transition hover:text-accent disabled:opacity-60",
};

export default function Button({
  variant = "primary",
  className = "",
  type = "button",
  children,
  ...rest
}: {
  variant?: Variant;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={`${VARIANTS[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

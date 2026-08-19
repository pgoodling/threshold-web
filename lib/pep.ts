// A line for Evelyn, one per day.
//
// The tone to hold: someone who knows the work talking to her, not a poster.
// Specific beats general — foils, the mirror, the first client through the door
// — because a line about *her* job lands and a line about Believing In Yourself
// slides straight off. No exclamation marks doing the work a sentence should do,
// and nothing that would embarrass her if a client read it over her shoulder.
//
// Picked by date rather than at random, so it's the same line all day and a
// different one tomorrow. Random would re-roll on every render, which turns a
// message into a slot machine.

type Pool = string[];

// Counting down. These carry most of the weight — they run for weeks.
const BEFORE: Pool = [
  "Every chair you've ever rented was practice for this one.",
  "You already know how to do the hard part. The rest is boxes and paperwork.",
  "Nobody opening a salon has ever felt ready. They opened anyway.",
  "The clients who follow you are following you, not an address.",
  "A hundred and fifty-nine people already trust you with their hair.",
  "Slow is fine. Ready is better than fast.",
  "Today's small job is tomorrow's one less thing.",
  "You're not starting from scratch. You're starting from experience.",
  "The suite will look like yours the day you stop apologising for it.",
  "Somebody out there is already dreading finding a new stylist. You're the answer.",
  "Order the thing you keep forgetting to order.",
  "Opening day is a Monday. Mondays are survivable.",
  "The nerves aren't a warning. They're just the size of the thing.",
  "You've fixed worse than whatever goes wrong on day one.",
  "Your first client already knows you're good. That's why they booked.",
  "Do the boring one first. It's the one that's been following you around.",
  "A quiet first week is a first week. It still counts.",
  "The place doesn't have to be perfect. It has to be open.",
  "You've done ten thousand blowouts. You can do a lease.",
  "Ask for the deposit. You're allowed to protect your time.",
  "Price it like someone who's been doing this for years, because you have.",
  "Half of this list is optional. Find that half.",
  "Nobody will notice the thing you're worried they'll notice.",
  "You get to decide what the music is now.",
  "Tell one more person today. That's the whole marketing plan.",
  "The chair, the mirror, the light, you. Everything else is detail.",
  "Rest counts as preparation.",
  "This is the last time you'll open your first salon.",
];

// The morning of.
const OPENING_DAY: Pool = [
  "Today. Unlock the door and let them in.",
  "You open today. Everything after this is just Tuesday.",
  "Twelve years of other people's chairs. Today it's yours.",
];

// After. Runs indefinitely, so it has to age well.
const AFTER: Pool = [
  "The hard part is behind you. This part is just the job you're good at.",
  "Every regular you have now was a first appointment once.",
  "Check your book. That's yours.",
  "Rebooking beats advertising. Ask at the mirror, before they stand up.",
  "A client who feels remembered comes back. Write it down.",
  "You don't have to say yes to every gap in the calendar.",
  "Someone's telling a friend about you today.",
  "Take the lunch. The afternoon is better for it.",
  "The books you keep now are the ones you'll thank yourself for in a year.",
  "Quiet weeks happen to good stylists too.",
];

// Deterministic index from a date key: same line all day, different tomorrow,
// and no clustering the way `dayNumber % length` does when the pool size and
// the week line up.
function pick(pool: Pool, dayKey: string): string {
  let hash = 0;
  for (let i = 0; i < dayKey.length; i++) {
    hash = (hash * 31 + dayKey.charCodeAt(i)) | 0;
  }
  return pool[Math.abs(hash) % pool.length];
}

// Milestones override the rota — the numbers that actually feel like something.
const MILESTONES: Record<number, string> = {
  30: "A month out. Everything on the list is still easy from here.",
  14: "Two weeks. This is where it starts feeling real.",
  7: "One week. Stop adding to the list; start finishing it.",
  3: "Three days. Nothing new from here — just tie off what's open.",
  2: "Two days. Whatever isn't done by now probably didn't matter.",
  1: "Tomorrow. Lay it all out tonight and get an early night.",
};

export function pepLine(daysUntil: number, dayKey: string): string {
  if (daysUntil < 0) return pick(AFTER, dayKey);
  if (daysUntil === 0) return pick(OPENING_DAY, dayKey);
  return MILESTONES[daysUntil] ?? pick(BEFORE, dayKey);
}

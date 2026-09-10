// A line for Evelyn, one per day, on the studio home screen.
//
// This was a countdown pep talk — three pools keyed off how many days were left
// until opening, with milestone lines at 30, 14, 7. She opened on 7 September
// 2026, so two of those pools became unreachable the moment she unlocked the
// door and the third, ten lines long, started cycling every ten days forever.
// That's the whole reason this was rewritten: the countdown was temporary and
// the line outlasted it.
//
// THE TONE TO HOLD. Someone who knows the work talking to her, not a poster.
// Specific beats general — foils, the mirror, the deposit, the last five
// minutes — because a line about *her* job lands and a line about Believing In
// Yourself slides straight off. No exclamation marks doing the work a sentence
// should do. Nothing that would embarrass her if a client read it over her
// shoulder, which rules out anything sardonic about clients.
//
// Clients are "they". She cuts men's hair too, and a line that assumes every
// client is a woman is wrong about a quarter of her book.
//
// THREE SUBJECTS, because that's what she wants out of it: the craft itself,
// running the place, and the people in the chair. Kept in separate pools rather
// than one long list so the rotation can guarantee variety — otherwise a random
// draw hands her three lines about money in a row and the whole thing starts
// reading as nagging.

type Pool = string[];

// The work. Hair, cutting, colour, and the fashion end of it.
const CRAFT: Pool = [
  "A good haircut looks like it grew that way. That's the whole trick.",
  "The consultation is the service. The cutting is just carrying it out.",
  "Trends reach Ohio about a year after the runway. You have time to learn them.",
  "Nobody has ever complained that their hair was too healthy.",
  "The shape has to survive them drying it themselves on a Tuesday.",
  "Copy nothing exactly. A photo is a direction, not a specification.",
  "Dry cutting tells you what the wet cut couldn't.",
  "Your best work this year will be something nobody photographs.",
  "A gloss is a real service. Price it like one.",
  "The fringe is always a bigger decision than they think. Say so kindly.",
  "Colour theory doesn't care how tired you are. Mix it properly.",
  "Texture first, colour second. The cut is what people actually see.",
  "The mirror at the end is part of the haircut. Don't rush it.",
  "You learn more from one client who came back unhappy than from ten who didn't.",
  "Fashion recycles. You'll cut this same shape again in fifteen years.",
  "Sharp shears are a kindness to your own wrists.",
  "Post the hair, not the filter.",
  "Somebody's whole week is better because their roots are done.",
  "There's no shame in saying a colour will take two appointments.",
  "Style is what they keep doing after they leave your chair.",
];

// Running the place. The part nobody teaches at hair school.
const BUSINESS: Pool = [
  "Rebooking beats advertising. Ask at the mirror, before they stand up.",
  "You don't have to say yes to every gap in the calendar.",
  "The books you keep now are the ones you'll thank yourself for in a year.",
  "Put your prices up before you're resentful, not after.",
  "An empty Tuesday is data, not a verdict.",
  "Pay yourself. A business that only pays everyone else is a hobby.",
  "The deposit isn't rude. It's the reason you can afford to hold the time.",
  "Track what you spend on colour. It's always more than it feels like.",
  "A day off in the diary is a day off. Defend it like an appointment.",
  "Quiet weeks happen to good stylists too.",
  "Discount once and it quietly becomes the price.",
  "Your slowest month tells you more about the year than your best one.",
  "Write the policy down before you need it.",
  "Every regular you have now was a first appointment once.",
  "Check your book. That's yours.",
  "Money in the account isn't profit. Knowing the difference is the job.",
  "Buy the good chair. You'll be standing next to it for ten years.",
  "The thing you keep putting off is usually a ten-minute job.",
  "Growth is more of the right clients, not simply more clients.",
  "You built this. On the bad days that's still true.",
];

// The people in the chair.
const PEOPLE: Pool = [
  "A client who feels remembered comes back. Write it down.",
  "Someone is telling a friend about you today.",
  "Listen twice as long as you think you need to before you pick up the shears.",
  "Some come for the hair, some come for the hour. Both are paying.",
  "You don't have to fill every silence. Some of them are the point.",
  "The nervous one in the chair is usually the one who stays for years.",
  "When they say 'just a trim', ask them to show you with their fingers.",
  "Apologise once, fix it properly, and don't bring it up again.",
  "A client running late is not a personal insult.",
  "Ask when they last loved their hair. That's the real brief.",
  "Nobody remembers a rushed hello.",
  "What gets said in the chair stays in the room. That's why they talk.",
  "You can be warm and still hold a boundary.",
  "'I don't know what I want' means 'ask me better questions'.",
  "Say their name back to them. It's the cheapest kindness there is.",
  "A complaint made to your face is a gift. The other kind goes to Google.",
  "Take the lunch. The afternoon is better for it.",
  "Someone will cry in your chair one day. Just hand them the tissues.",
  "The last five minutes are what they remember. Don't spend them at the till.",
  "You're not responsible for fixing their day. Only their hair.",
];

const THEMES: Pool[] = [CRAFT, BUSINESS, PEOPLE];

// Days since the epoch, from a YYYY-MM-DD key. Parsed rather than clocked, so
// this is pure — the caller owns the question of what day it is where she is.
function dayNumber(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

// A cycle rather than a random draw or a hash.
//
// The theme advances every day, so she never gets two lines about money back to
// back. Inside a theme the index advances every third day, which means all
// sixty lines appear before any of them repeats — about two months. A hash
// would collide long before that and hand her the same line twice in a
// fortnight for no reason anyone could see.
//
// Twenty per pool is deliberate: neither 20 nor the 60-day cycle divides by 7,
// so nothing lands on the same weekday twice running.
export function dailyLine(dayKey: string): string {
  const n = dayNumber(dayKey);
  const theme = THEMES[n % THEMES.length];
  return theme[Math.floor(n / THEMES.length) % theme.length];
}

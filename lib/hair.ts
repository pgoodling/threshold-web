// Hair-color helpers for the client "regrowth" lifecycle view.
// A client's strand color comes from her recorded formula (level + tone) — e.g.
// "9G" (level 9, gold) or "5N" (level 5, neutral) — or a service-type default
// when none is recorded. The dark root band grows with time since last visit.

export const ROOT_HEX = "#4e3626"; // natural regrowth (dark)
const DEFAULT_HEX = "#c89b6e"; // warm neutral, last-resort default

// Neutral base per level, 1 (darkest) → 10 (lightest blonde).
const LEVEL_HEX: Record<number, string> = {
  1: "#1c1512",
  2: "#271a14",
  3: "#37241b",
  4: "#4c3324",
  5: "#6f4630",
  6: "#8a5a3c",
  7: "#a9764a",
  8: "#c99b6b",
  9: "#e2c78d",
  10: "#efdcb0",
};

// Tone / reflect: the hue the base is nudged ~30% toward. N (neutral) = no shift.
const TONE_TINT: Record<string, string | null> = {
  N: null,
  A: "#8f8f86", // ash
  B: "#c9b79a", // beige
  G: "#e6c15c", // gold
  W: "#e6c15c", // warm
  C: "#c8712f", // copper
  O: "#c8712f", // orange
  R: "#b23a2a", // red
  V: "#7a4a86", // violet
};

const TONE_NAME: Record<string, string> = {
  N: "neutral",
  A: "ash",
  B: "beige",
  G: "gold",
  W: "warm",
  C: "copper",
  O: "copper",
  R: "red",
  V: "violet",
};

const LEVEL_NAME: Record<number, string> = {
  1: "black",
  2: "darkest brown",
  3: "dark brown",
  4: "medium brown",
  5: "light brown",
  6: "dark blonde",
  7: "blonde",
  8: "light blonde",
  9: "very light blonde",
  10: "lightest blonde",
};

function hexToRgb(h: string): [number, number, number] {
  const s = h.replace("#", "");
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return (
    "#" +
    A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("")
  );
}

export function parseFormula(
  formula: string | null | undefined,
): { level: number; tone: string } | null {
  if (!formula) return null;
  const m = formula.match(/(\d{1,2})\s*([A-Za-z])?/);
  if (!m) return null;
  const level = Math.max(1, Math.min(10, parseInt(m[1], 10)));
  const tone = (m[2] || "N").toUpperCase();
  return { level, tone };
}

// Hex for a formula, or null if it can't be parsed.
export function formulaHex(formula: string | null | undefined): string | null {
  const p = parseFormula(formula);
  if (!p) return null;
  const base = LEVEL_HEX[p.level] ?? LEVEL_HEX[9];
  const tint = TONE_TINT[p.tone];
  return tint ? mix(base, tint, 0.3) : base;
}

// Plain-language shade for a formula (e.g. "gold light blonde"), or null.
export function formulaName(formula: string | null | undefined): string | null {
  const p = parseFormula(formula);
  if (!p) return null;
  const tone = TONE_NAME[p.tone];
  const prefix = tone && tone !== "neutral" ? `${tone} ` : "";
  return `${prefix}${LEVEL_NAME[p.level] ?? ""}`.trim();
}

// Service-type default hair color (keyword match on the service name).
export function serviceHex(name: string | null | undefined): string {
  const n = (name ?? "").toLowerCase();
  if (n.includes("highlight") || n.includes("blond") || n.includes("balayage"))
    return "#e2c78d";
  if (n.includes("men")) return "#6f4630";
  if (n.includes("color")) return "#b4623a";
  if (n.includes("treatment")) return "#8a5a3c";
  if (n.includes("blowout")) return "#c89b6e";
  if (n.includes("cut")) return "#a9764a";
  return DEFAULT_HEX;
}

// Final strand colors: her formula wins, else the service default.
export function strandColors(
  formula: string | null | undefined,
  serviceName?: string | null,
): { hair: string; root: string } {
  return { hair: formulaHex(formula) ?? serviceHex(serviceName), root: ROOT_HEX };
}

// Root-band fraction (0–1) from weeks since last attended visit — the regrowth.
export function regrowthPct(weeksSinceLast: number | null): number {
  if (weeksSinceLast == null) return 0.07;
  return Math.min(0.78, Math.max(0.07, 0.07 + weeksSinceLast * 0.05));
}

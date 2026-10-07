// How many billed pieces ("segments") a text is.
//
// In the GSM-7 alphabet a single text holds 160 characters and a long one is
// split into 153-character segments; one character outside it switches the
// whole message to UCS-2, 70 / 67. A single em dash once made the day-before
// reminder cost 5 segments instead of 2. The tests hold every template to the
// cheap alphabet, so that can't come back quietly.

// GSM 03.38 basic set, and the extension table (each costs two characters).
const BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡" +
  "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const EXTENSION = "^{}\\[~]|€";

export type SegmentCount = {
  encoding: "GSM-7" | "UCS-2";
  /** Characters as the carrier counts them: extension characters are two. */
  length: number;
  segments: number;
  /** Code points that forced UCS-2, as "U+2014". Empty for GSM-7. */
  culprits: string[];
};

export function countSegments(text: string): SegmentCount {
  const chars = [...text];
  const outside = chars.filter((c) => !BASIC.includes(c) && !EXTENSION.includes(c));
  if (outside.length === 0) {
    const length = chars.reduce((n, c) => n + (EXTENSION.includes(c) ? 2 : 1), 0);
    return { encoding: "GSM-7", length, segments: length <= 160 ? 1 : Math.ceil(length / 153), culprits: [] };
  }
  const length = text.length; // UTF-16 units
  return {
    encoding: "UCS-2",
    length,
    segments: length <= 70 ? 1 : Math.ceil(length / 67),
    culprits: [...new Set(outside)].map((c) => "U+" + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")),
  };
}

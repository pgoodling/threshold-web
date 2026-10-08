// Names as typed on a phone often come in all lowercase ("emma jackowski") or
// all caps. Capitalise a word only when it's all one case, so a name typed
// with care -- McDonald, DeLuca, O'Brien, van der Berg -- is left exactly as is.
export function tidyName(name: string) {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) =>
      w === w.toLowerCase() || (w === w.toUpperCase() && w.length > 2)
        ? w.toLowerCase().replace(/(^|[-'])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase())
        : w,
    )
    .join(" ");
}

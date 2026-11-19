// The new design number, and the counters behind it.
//
// From November 2026 a new PD sheet takes the next number for its category
// rather than having one typed on it:
//
//   SN-RG-WG-297      one ring, white gold, number 297
//   SN-RG-YG-297      the same design in yellow gold, the same number
//   SN-RG-WG-297-301  five rings, white gold, numbered 297 to 301
//
// Three parts and then the run: the house, the category, the gold colour. That
// is the same shape parseDesignNo() has always read — the base is "SN-RG-WG"
// and the run is the trailing number or span — so every piece of a run is
// searchable on its own exactly as it was under "SN-BR-AMF-10CT-45-49", and
// nothing already saved has to be re-read or renumbered.
//
// Nothing here touches storage, so both the browser and the server use it. What
// the counters stand at is in pdStore.ts, beside the PD numbers, because a
// design number is taken by the save that writes the sheet.
import { normalizeCode } from "./memoFormat";
import { HOUSE_CODE, parseDesignNo } from "./designNo";

// Only white and yellow. Rose gold has no code of its own because RG is
// already the ring, so a rose sheet cannot have a number built for it and the
// PD man types one by hand.
export type DesignColour = "WG" | "YG";

// The six categories the office numbers this way, and the code each one is
// written as. These are the codes the Lists screen already keeps against a
// category — see suggestCode() in memoFormat.ts, which offers exactly these —
// so the code comes off the list rather than being mapped again here. What is
// here is the shorter list of codes a number may be built from: a category
// coded anything else gets no automatic number rather than a broken one.
export const DESIGN_CATEGORY_CODES: readonly string[] = [
  "RG", "ER", "NK", "BR", "PEND", "BN",
];

// What each category's counter hands out first, which is what the owner gave:
// the first ring sheet made in the portal is 297 and the counter then stands at
// 297, so the next is 298.
//
// This is how the counters are seeded, and it is deliberately not a migration
// anybody has to run: the statement that takes a number inserts this value when
// there is no row yet and raises the row by the run's length when there is, so
// the first sheet of a category seeds its own counter as it takes its number.
// Nothing has to be pressed, and a database restored from a backup keeps
// whatever its counters had reached.
export const DESIGN_FIRST: Record<string, number> = {
  RG: 297,
  ER: 2566,
  NK: 404,
  BR: 521,
  PEND: 134,
  BN: 6,
};

// Three digits, and more when the number outgrows them: 006 and 2566 are both
// written as they are.
export const DESIGN_WIDTH = 3;

export const padDesign = (n: number): string => String(n).padStart(DESIGN_WIDTH, "0");

export function isDesignCategoryCode(code: string): boolean {
  return DESIGN_CATEGORY_CODES.includes(normalizeCode(code));
}

// The gold colour as it is written into the number. The sheet's box holds
// "White Gold"; older sheets and the order prefill hold "WHITE" or "White";
// both read the same, and anything else reads as no colour at all.
export function designColourCode(goldColor: string): DesignColour | "" {
  const raw = normalizeCode(goldColor).replace(/GOLD$/, "");
  if (raw === "WHITE" || raw === "WG" || raw === "W") return "WG";
  if (raw === "YELLOW" || raw === "YG" || raw === "Y") return "YG";
  return "";
}

// "SN-RG-WG", the part of the number that is not the run.
export function designBase(code: string, colour: DesignColour): string {
  return [HOUSE_CODE, normalizeCode(code), colour].join("-");
}

// The whole number. `to` below `from` is not a run, so it is written as the one
// piece it names.
export function designNumber(
  code: string,
  colour: DesignColour,
  from: number,
  to: number
): string {
  const base = designBase(code, colour);
  return to > from ? `${base}-${padDesign(from)}-${padDesign(to)}` : `${base}-${padDesign(from)}`;
}

// A printf template for the database to fill in, in the same two shapes, so the
// number the save writes is composed by the one function that knows the format.
export function designTemplate(code: string, colour: DesignColour, spanned: boolean): string {
  const base = designBase(code, colour);
  return spanned ? `${base}-%0${DESIGN_WIDTH}d-%0${DESIGN_WIDTH}d` : `${base}-%0${DESIGN_WIDTH}d`;
}

// Where a counter's value is kept, among the PD sheets' own running numbers.
// Prefixed, because that table already holds one row per financial year.
export function designCounterKey(code: string): string {
  return `design:${normalizeCode(code)}`;
}

// Which category counter a hand-typed number belongs to, and how far it goes.
//
// Only a number in the new format answers. That is the whole point of reading
// it this way rather than looking for digits: "SN-BR-AMF-10CT-45-49" and
// "SS-RG-SO-OV-001 - B" are numbers from before this format and must never move
// a counter, so the house, the category code and the colour all have to be
// where the new format puts them and the run has to end the number.
export function designCounterFor(sku: string): { code: string; to: number } | null {
  const run = parseDesignNo(sku || "");
  if (run.at !== 3) return null;
  // The run has to be the end of it: a number with codes written after it is
  // not one of these.
  if (run.at + (run.spanned ? 2 : 1) !== run.segs.length) return null;
  const [house, code, colour] = run.segs;
  if (house !== HOUSE_CODE) return null;
  if (!isDesignCategoryCode(code)) return null;
  if (colour !== "WG" && colour !== "YG") return null;
  return { code: normalizeCode(code), to: run.to };
}

// What a category's counter must stand at for a hand-typed number never to be
// handed out again. Below the category's own first number it stands still, so
// an old design renumbered by hand cannot drag the counter back under 297 and
// start the book again.
export function designCounterFloor(code: string, to: number): number {
  const first = DESIGN_FIRST[normalizeCode(code)];
  return Math.max(to, (first || 1) - 1);
}

// Why a category cannot have a number built for it, said the way it is said on
// screen. Blank when it can.
export function whyNoDesignNo(category: string, code: string, goldColor: string): string {
  if (!category.trim()) return "Choose a category and the number fills itself in.";
  if (!normalizeCode(code)) {
    return `${category} has no code on the Lists screen, so the number cannot be built. Type it by hand.`;
  }
  if (!isDesignCategoryCode(code)) {
    return `${category} is coded ${normalizeCode(code)}, which is not one of the six numbered categories. Type the number by hand.`;
  }
  if (!designColourCode(goldColor)) {
    return "Only white and yellow gold have a code, so the number cannot be built. Type it by hand.";
  }
  return "";
}

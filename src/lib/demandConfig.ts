// Diamond demand — the sheet the diamond department works from once a PD
// sheet exists. Columns mirror the paper format:
//   Date | Design No | Diamond Shape | Diamond Pointers | Number Of Pcs |
//   Comments | BAGS | CVD/HPHT
import {
  formatPointer, piecesOfLine, pointerHasUnit, type DiaLine,
} from "./pdConfig";

export type DemandRow = {
  designNo: string;
  shape: string;
  pointers: string; // per-piece weight as written, e.g. "1CT" / "0.75CT"
  pcs: string;
  comments: string;
  bags: string;
  growth: string; // CVD / HPHT
};

export const GROWTH_TYPES = ["CVD", "HPHT", "NATURAL"];

export const BLANK_DEMAND_ROW: DemandRow = {
  designNo: "", shape: "", pointers: "", pcs: "", comments: "", bags: "", growth: "CVD",
};

// "1.0000" -> "1CT"; a sieve name is already how the demand reads, so it is
// passed through untouched.
export function pointersLabel(line: DiaLine): string {
  const isRound = line.shape.trim().toLowerCase() === "round";
  if (isRound) return line.size.trim() || line.mm.trim();
  // A unit written on the PD sheet carries through to the demand as written —
  // "3.57 cts" must not arrive at the diamond department reading as pointers.
  if (pointerHasUnit(line.pointer)) return formatPointer(line.pointer);
  const n = parseFloat(line.pointer);
  if (!isFinite(n) || n <= 0) return line.mm.trim();
  return `${parseFloat(n.toFixed(4))}CT`;
}

// Seed a demand from a PD sheet: one row per diamond size on that design.
//
// BAGS is how many pieces take that size, because a bag is one piece's stones
// of one size — sizes cannot share a bag and neither can pieces. Which pieces a
// size goes into is on the PD sheet itself, so nothing here is guessed:
//
//   Earrings drawn PEAR 1CT and PEAR 1.5CT, both in each of 039 and 040
//     -> 2 bags on each row, 4 in all
//   Bracelets drawn 5.25*3.75 for 005 and 5.5*3.75 for 006
//     -> 1 bag on each row, 2 in all
//   Five bracelets of one sieve -> 5 bags on the one row
//   One MIX piece of three sizes -> 1 bag on each row, 3 in all
//
// PCS stays one piece's worth, as the sheet writes it — "1CT EACH - 2 PCS" is
// two stones in an earring, not two across the pair.
export function rowsFromPdSheet(
  designNo: string,
  lines: DiaLine[] | undefined,
  quantity = "",
  run: string[] = []
): DemandRow[] {
  const pieces = run.length ? run : fallbackRun(quantity);
  const rows = (lines || [])
    .filter((l) => l.shape || l.size || l.mm || l.pointer || l.pcs)
    .map((l) => ({
      designNo,
      shape: l.shape.trim().toUpperCase(),
      pointers: pointersLabel(l),
      pcs: l.pcs.trim(),
      comments: "",
      bags: String(piecesOfLine(l, pieces).length),
      growth: "CVD",
    }));
  // Nothing entered on the sheet yet: one row standing for the whole design, so
  // the pieces it is for is the honest figure to start it at.
  return rows.length ? rows : [{ ...BLANK_DEMAND_ROW, designNo, bags: quantity.trim() }];
}

// A design number with no run in it — a single piece — still makes pieces, and
// the quantity is all there is to go on.
function fallbackRun(quantity: string): string[] {
  const n = parseInt((quantity || "").trim(), 10) || 1;
  return Array.from({ length: Math.max(1, n) }, (_, i) => String(i + 1));
}

// Stones to count out, not stones per piece: a row reading 2 pcs against 2 bags
// is four stones leaving the department.
export function totalPcs(rows: DemandRow[]): number {
  return rows.reduce((n, r) => {
    const pcs = parseInt(r.pcs, 10) || 0;
    const bags = parseInt(r.bags, 10) || 0;
    return n + pcs * (bags || 1);
  }, 0);
}
export function totalBags(rows: DemandRow[]): number {
  return rows.reduce((n, r) => n + (parseInt(r.bags, 10) || 0), 0);
}

// --- What the demand list says about a demand --------------------------------
//
// The list shows the design numbers on a demand and the stones it counts out,
// and searches a line of text built from both the demand and its rows. All
// three are worked out from `rows`, and two places now need the same answers:
// the list itself, and the columns the database keeps so the list never has to
// read the rows at all.
//
// Taking a demand-shaped thing rather than a Demand keeps this file where it
// is, knowing nothing about storage, as everything else in it does.
export type DemandSummary = {
  demandNo: string;
  issuedTo: string;
  pdNo?: string;
  rows: DemandRow[];
};

// The distinct design numbers, in the order they appear on the demand.
export function demandDesigns(d: DemandSummary): string[] {
  const designs: string[] = [];
  for (const r of d.rows) {
    if (r.designNo && !designs.includes(r.designNo)) designs.push(r.designNo);
  }
  return designs;
}

// Everything the search can match on except the demand's own number, joined
// exactly as the browser used to join it and lower-cased once instead of once
// per keystroke.
//
// The number is left out of this half on purpose, and it is worth saying why.
// When a demand is saved into the database the number is issued by the database
// inside the transaction that writes the row, so at the moment this is worked
// out there is no number yet. Building the searchable line without it, and
// putting the number back on the way out, is what keeps the number searchable
// without the portal having to know it in advance.
export function demandSearchRest(d: DemandSummary): string {
  const text: string[] = [d.issuedTo, d.pdNo || ""];
  for (const r of d.rows) {
    text.push(`${r.designNo} ${r.shape} ${r.pointers} ${r.growth}`);
  }
  return text.join(" ").toLowerCase();
}

// The number put back on the front of it. The result is the same line, to the
// character, that the browser used to build for itself.
export function joinDemandSearch(demandNo: string, rest: string): string {
  return `${(demandNo || "").toLowerCase()} ${rest}`;
}

// The whole searchable line, for a demand that already has its number.
export function demandSearchText(d: DemandSummary): string {
  return joinDemandSearch(d.demandNo, demandSearchRest(d));
}

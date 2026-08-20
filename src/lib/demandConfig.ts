// Diamond demand — the sheet the diamond department works from once a PD
// sheet exists. Columns mirror the paper format:
//   Date | Design No | Diamond Shape | Diamond Pointers | Number Of Pcs |
//   Comments | BAGS | CVD/HPHT
import { formatPointer, pointerHasUnit, type DiaLine } from "./pdConfig";

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
// One bag per row. A diamond line on the PD sheet is one piece's worth of
// stones — "SN-BR-TN-OV-14CT-005-006" written with two oval sizes is piece 005
// in the first size and piece 006 in the second, so the diamond department
// packs one bag for each. It is deliberately not the sheet's quantity written
// onto every row: that asked for a bag per piece *per size*, so a two-piece
// design with two sizes came out at four bags instead of two.
//
// `quantity` is not used to work the bags out any more, but it is what the
// total is checked against — see bagsWanted below.
export function rowsFromPdSheet(
  designNo: string,
  lines: DiaLine[] | undefined,
  quantity = ""
): DemandRow[] {
  const rows = (lines || [])
    .filter((l) => l.shape || l.size || l.mm || l.pointer || l.pcs)
    .map((l) => ({
      designNo,
      shape: l.shape.trim().toUpperCase(),
      pointers: pointersLabel(l),
      pcs: l.pcs.trim(),
      comments: "",
      bags: "1",
      growth: "CVD",
    }));
  // Nothing entered on the sheet yet: one row standing for the whole design, so
  // the pieces it is for is the honest figure to start it at.
  return rows.length ? rows : [{ ...BLANK_DEMAND_ROW, designNo, bags: quantity.trim() }];
}

// How many bags the design should come to — one per piece. A demand that does
// not add up to this is either short of a piece or carrying a spare, and both
// are worth saying out loud before the stones are packed.
export function bagsWanted(quantity: string): number {
  return parseInt((quantity || "").trim(), 10) || 0;
}

export function totalPcs(rows: DemandRow[]): number {
  return rows.reduce((n, r) => n + (parseInt(r.pcs, 10) || 0), 0);
}
export function totalBags(rows: DemandRow[]): number {
  return rows.reduce((n, r) => n + (parseInt(r.bags, 10) || 0), 0);
}

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
// `quantity` is how many pieces of jewellery are being made, and that is what
// drives BAGS — one bag of diamonds per piece. It is deliberately not the
// diamond count: an order for 2 bracelets is 2 bags however many stones each
// one takes.
export function rowsFromPdSheet(
  designNo: string,
  lines: DiaLine[] | undefined,
  quantity = ""
): DemandRow[] {
  const bags = quantity.trim();
  const rows = (lines || [])
    .filter((l) => l.shape || l.size || l.mm || l.pointer || l.pcs)
    .map((l) => ({
      designNo,
      shape: l.shape.trim().toUpperCase(),
      pointers: pointersLabel(l),
      pcs: l.pcs.trim(),
      comments: "",
      bags,
      growth: "CVD",
    }));
  return rows.length ? rows : [{ ...BLANK_DEMAND_ROW, designNo, bags }];
}

export function totalPcs(rows: DemandRow[]): number {
  return rows.reduce((n, r) => n + (parseInt(r.pcs, 10) || 0), 0);
}
export function totalBags(rows: DemandRow[]): number {
  return rows.reduce((n, r) => n + (parseInt(r.bags, 10) || 0), 0);
}

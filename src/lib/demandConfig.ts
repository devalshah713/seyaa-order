// Diamond demand — the sheet the diamond department works from once a PD
// sheet exists. Columns mirror the paper format:
//   Date | Design No | Diamond Shape | Diamond Pointers | Number Of Pcs |
//   Comments | BAGS | CVD/HPHT
import type { DiaLine } from "./pdConfig";

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
  const n = parseFloat(line.pointer);
  if (!isFinite(n) || n <= 0) return line.mm.trim();
  return `${parseFloat(n.toFixed(4))}CT`;
}

// Seed a demand from a PD sheet: one row per diamond size on that design.
export function rowsFromPdSheet(
  designNo: string,
  lines: DiaLine[] | undefined
): DemandRow[] {
  const rows = (lines || [])
    .filter((l) => l.shape || l.size || l.mm || l.pointer || l.pcs)
    .map((l) => ({
      designNo,
      shape: l.shape.trim().toUpperCase(),
      pointers: pointersLabel(l),
      pcs: l.pcs.trim(),
      comments: "",
      // The paper sheet bags each size separately, one bag per piece.
      bags: l.pcs.trim(),
      growth: "CVD",
    }));
  return rows.length ? rows : [{ ...BLANK_DEMAND_ROW, designNo }];
}

export function totalPcs(rows: DemandRow[]): number {
  return rows.reduce((n, r) => n + (parseInt(r.pcs, 10) || 0), 0);
}
export function totalBags(rows: DemandRow[]): number {
  return rows.reduce((n, r) => n + (parseInt(r.bags, 10) || 0), 0);
}

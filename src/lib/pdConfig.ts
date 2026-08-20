// Field options and the SKU auto-builder for the Product Development (PD) sheet.
// Every option list is a *suggestion* — the form's combo inputs accept any typed
// value, so the team is never blocked by a missing option.

export const PRODUCTS = [
  "Tennis Necklace", "Necklace", "Necklace Set", "Tennis Bracelet", "Bracelet",
  "Ring", "Earrings", "Pendant", "Bangle", "Chain",
];

export const CATEGORIES = [
  "Korean Necklace", "Tennis", "Solitaire", "Cluster", "Halo",
  "Eternity", "Bridal", "Daily Wear", "Cocktail",
];

export const SUB_CATEGORIES = [
  "Tennis Necklace", "Tennis Bracelet", "Riviera", "Line Necklace",
  "Choker", "Station Necklace", "Solitaire Ring", "Band",
];

export const TYPES = ["Modern", "Classic", "Traditional", "Fusion", "Minimal"];

export const DIA_QUALITIES = [
  "VVS-EF", "VS-EF", "VVS-GH", "VS-GH", "SI-GH", "SI-IJ", "VVS-DEF", "VS-FG",
];

export const DIA_SHAPES = [
  "Round", "Oval", "Pear", "Marquise", "Emerald", "Princess",
  "Cushion", "Radiant", "Heart", "Baguette",
];

export const GOLD_PURITIES = ["14KT", "18KT", "10KT", "9KT", "22KT"];

export const GOLD_COLORS = ["White Gold", "Yellow Gold", "Rose Gold"];

export const ZONES = ["USA", "Dubai", "Hong Kong", "India"];

export const LOCKS = [
  "Under Lock", "Lobster Lock", "Box Lock", "Spring Ring",
  "Push Lock", "S Hook", "Adjustable",
];

export const ORDER_TYPES = ["Stock", "Custom", "Repeat", "Sample", "Exhibition"];

// The size field is labelled per product type — necklaces get "Neck Length",
// rings get "Ring Size", and so on.
export function sizeLabel(product: string): string {
  const p = product.trim().toLowerCase();
  if (p.includes("ring")) return "Ring Size";
  if (p.includes("bracelet") || p.includes("bangle")) return "Bracelet Size";
  if (p.includes("earring")) return "Earring Length";
  if (p.includes("pendant")) return "Pendant Size";
  return "Neck Length";
}

// --- Diamond sizes -----------------------------------------------------------
// One row per diamond size on the sheet. Round rows carry a sieve `size` (plus
// the `mm`/`pointer` looked up from the master); fancy rows carry a typed `mm`
// and a chosen per-piece `pointer`.
export type DiaLine = {
  shape: string;
  size: string;
  mm: string;
  pointer: string;
  pcs: string; // one piece's worth of this size
  // Which pieces of the run take this size, by sub-design number ("039",
  // "005"), comma separated. Blank means all of them, which is the ordinary
  // case: a design's sizes are the sizes every piece of it is made from.
  //
  // It is filled in when a run is drawn with a size per piece —
  // "SN-BR-TN-OV-14CT-005-006" as two oval sizes is 005 in one and 006 in the
  // other. Without it that sheet is indistinguishable from a pair of earrings
  // set with two pear sizes each, and the two need opposite answers.
  pieces?: string;
};

export const BLANK_DIA_LINE: DiaLine = {
  shape: "Round", size: "", mm: "", pointer: "", pcs: "", pieces: "",
};

export const ALL_PIECES = "All pieces";

// The pieces a line goes to, as a list of sub-design numbers. `run` is every
// piece the design covers, and is what a blank box means.
export function piecesOfLine(line: Pick<DiaLine, "pieces">, run: string[]): string[] {
  const named = (line.pieces || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!named.length) return run;
  // Only pieces the design actually has: a sub number left behind after the
  // run was edited must not conjure a piece that is not being made.
  const keep = named.filter((n) => run.some((r) => r.toLowerCase() === n.toLowerCase()));
  return keep.length ? keep : run;
}

export function lineGoesTo(line: Pick<DiaLine, "pieces">, piece: string, run: string[]): boolean {
  return piecesOfLine(line, run).some((p) => p.toLowerCase() === piece.trim().toLowerCase());
}

function trimNum(p: string): string {
  const n = parseFloat(p);
  return isFinite(n) ? String(parseFloat(n.toFixed(4))) : p;
}

// --- Per-stone weight --------------------------------------------------------
// The pointer box holds the weight of one stone, and the team writes it both
// ways — "3.57 cts" for a big fancy stone, "25 pts" for a small one. Whatever
// unit is typed is the unit that prints: the sheet should read the way the
// person filling it in meant it, not be rewritten to one house unit.
//
// A bare number keeps printing as PTR, which is what the size dropdown supplies
// and how these sheets have always read.

const POINTER_RE = /^\s*([0-9]*\.?[0-9]+)\s*([A-Za-z.]*)\s*$/;

function splitPointer(raw: string): { n: string; unit: string } | null {
  const m = POINTER_RE.exec(raw || "");
  if (!m) return null;
  return { n: m[1], unit: m[2].replace(/\./g, "").toUpperCase() };
}

export function formatPointer(raw: string): string {
  const t = (raw || "").trim();
  if (!t) return "";
  const p = splitPointer(t);
  // Anything that is not a number with a unit is printed exactly as typed
  // rather than being silently reshaped.
  if (!p) return t.toUpperCase();
  return `${trimNum(p.n)} ${p.unit || "PTR"}`;
}

// True when a unit was actually written, so callers can leave their own
// house formatting alone for the bare numbers that come out of the dropdown.
export function pointerHasUnit(raw: string): boolean {
  const p = splitPointer((raw || "").trim());
  return !!p && !!p.unit;
}

export function formatDiaLine(l: DiaLine): string {
  const shape = (l.shape || "").trim().toUpperCase();
  const pcs = l.pcs.trim() ? ` – ${l.pcs.trim()} PCS` : "";
  const isRound = l.shape.trim().toLowerCase() === "round";

  if (isRound) {
    const size = l.size.trim();
    if (!size) return shape ? `${shape}${pcs}`.trim() : "";
    const mm = l.mm.trim() ? ` (${l.mm.trim()})` : "";
    return `${shape} - ${size}${mm}${pcs}`;
  }

  const parts = [l.mm.trim(), formatPointer(l.pointer)]
    .filter(Boolean)
    .join(" / ");
  if (!parts) return shape ? `${shape}${pcs}`.trim() : "";
  return `${shape} - ${parts}${pcs}`;
}

export function formatDiaLines(lines: DiaLine[]): string {
  return lines.map(formatDiaLine).filter(Boolean).join("  ;  ");
}

// The sheet has a single "Dia. Shape" cell — use the shapes actually entered.
export function shapesFromLines(lines: DiaLine[]): string {
  const seen: string[] = [];
  for (const l of lines) {
    const s = l.shape.trim();
    if (s && !seen.some((x) => x.toLowerCase() === s.toLowerCase())) seen.push(s);
  }
  return seen.join(", ");
}

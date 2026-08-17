// The stock book: a finished piece of jewellery taken into stock, valued.
//
// One entry is one piece. Its diamonds are one or more lines — a plain tennis
// bracelet has a single stone size, a fancy ring has several — which is the
// only difference between the two sheets in the company's workbook. There, a
// single-size piece is a row on STOCK carrying its own prices, and a
// multi-size piece is a row on STOCK reading "MIX" with its money left blank
// and its lines kept on a second sheet. Here it is one thing with a list of
// lines, and the export puts it back into whichever shape the workbook wants.

import { pricePiece, type PriceList, type PricedPiece } from "./priceList";

export type StockLine = {
  breakupWt: string; // carats of this stone size
  pcs: string;
  shape: string; // RD, OV, PE …
  sieve: string; // sieve name or the millimetres, as written
  code: string; // Product Code — what the price is looked up on
};

export const BLANK_LINE: StockLine = {
  breakupWt: "", pcs: "", shape: "", sieve: "", code: "",
};

export type StockEntry = {
  id: string;
  stockNo: string; // Sr. No.
  date: string; // yyyy-mm-dd
  design: string; // the description, e.g. "50PTS EACH OVAL BEZEL TENNIS BRACELET"
  designNo: string;
  category: string;
  subCategory: string;
  subSubCategory: string;
  location: string;
  goldDetails: string; // "14K WHITE" — the purity in it picks the gold rate
  inchSize: string;
  grossWt: string;
  netWt: string;
  partyName: string;
  polkiLabour: boolean;
  lines: StockLine[];
  comments: string;

  // Where the piece came from, so a stock number can be traced back to the
  // sheet it was designed on, the demand its stones were raised under and the
  // memo they went out on.
  jangadIds?: string[];
  pdId?: string;
  pdNo?: string;
  demandNos?: string[];
  memoNos?: string[];
  mfgName?: string;

  createdAt: string;
  updatedAt: string;
};

export type NewStockEntry = Omit<StockEntry, "id" | "createdAt" | "updatedAt">;

// Suggestions only — every one of these boxes takes a typed value, because the
// workbook's own columns do.
export const LOCATIONS = ["USA", "INDIA", "INDIA SELL", "DUBAI", "HONG KONG"];
export const GOLD_DETAILS = [
  "14K WHITE", "14K YELLOW", "14K ROSE", "18K WHITE", "18K YELLOW", "18K ROSE",
];
export const CATEGORIES = ["BRACELET", "NECKLACE", "RING", "EARRING", "PENDANT", "BANGLE", "CHAIN"];
export const SHAPES = ["RD", "OV", "PE", "EM", "MQ", "PR", "CU", "HE", "RAD", "BG", "TAP", "TR", "AS", "KI", "MIX"];
export const PARTIES = ["SEYAA FACTORY"];

// The workbook's columns, in its order. Used by the export and to label the
// register, so the two never drift from the file the office already keeps.
export const STOCK_HEADERS = [
  "Sr. No.", "DATE", "DESIGN", "Design Number", "Category", "Sub-Category",
  "Sub-Sub-Category", "LOCATION", "Gold Details", "INCH SIZE", "GROSS WEIGHT",
  "NET WEIGHT", "TOTAL DIAMOND WEIGHT", "DIAMOND WEIGHT BREAKUP", "DIA PCS.",
  "TOTAL DIA PCS.", "POINTERS", "SHAPE", "Sieve / Size", "PARTY NAME",
  "Product Code", " Diamond Price ($)", "Gold Price ($)", "Labor ($)",
  "Total ($)", " Diamond Price (₹)", "Gold Price (₹)", "Labor (₹)",
  "Total (₹)", "COMMENTS",
];

export const STOCK_WIDTHS = [
  10, 12, 34, 30, 14, 16, 18, 13, 14, 12, 14, 13, 20, 22, 10, 14, 11, 10, 26,
  16, 14, 16, 14, 12, 13, 16, 15, 13, 14, 40,
];

// A piece with more than one stone size is the workbook's "MIX": its STOCK row
// says so in every per-stone column and carries no money, because the money is
// on the second sheet.
export const MIX = "MIX";
export const isMix = (e: { lines: StockLine[] }) => e.lines.length > 1;

export function priceOf(list: PriceList, e: {
  netWt: string; goldDetails: string; polkiLabour?: boolean; lines: StockLine[];
}): PricedPiece {
  return pricePiece(list, {
    netWt: e.netWt,
    goldDetails: e.goldDetails,
    polkiLabour: e.polkiLabour,
    lines: e.lines.map((l) => ({ breakupWt: l.breakupWt, pcs: l.pcs, code: l.code })),
  });
}

// A line is worth keeping if anything at all was put in it.
export function hasContent(l: StockLine): boolean {
  return !!(l.breakupWt.trim() || l.pcs.trim() || l.shape.trim() || l.sieve.trim() || l.code.trim());
}

// --- Guessing the Product Code ----------------------------------------------
// The code is what the price hangs on, and it is the one thing nobody wants to
// look up on a printed sheet. A round stone is known by its sieve, a fancy one
// by its shape and how heavy each stone is — which the price list already
// records, so most of the time the code can be offered rather than hunted for.

function norm(s: string): string {
  return (s || "").toUpperCase().replace(/\s+/g, "").replace(/MM$/, "");
}

// "0.01 - 0.99" → [0.01, 0.99]; anything unreadable is treated as open.
function band(text: string): [number, number] {
  const m = (text || "").match(/([0-9]*\.?[0-9]+)\s*-\s*([0-9]*\.?[0-9]+)/);
  if (!m) return [-Infinity, Infinity];
  return [Number(m[1]), Number(m[2])];
}

export function suggestCode(
  list: PriceList,
  line: { shape: string; sieve: string; breakupWt: string; pcs: string }
): string {
  const sieve = norm(line.sieve);
  const shape = (line.shape || "").trim().toUpperCase();

  // Round: the sieve name is the identity, and it is written the same way in
  // both places.
  if (sieve) {
    const hit = list.round.find((r) => norm(r.sieve) === sieve);
    if (hit) return hit.code;
  }

  if (!shape || shape === MIX) return "";

  // Fancy: the shape narrows it to a couple of codes that differ only by how
  // heavy one stone is, so the per-stone weight picks between them.
  const wt = Number(line.breakupWt), pcs = Number(line.pcs);
  const per = Number.isFinite(wt) && pcs ? wt / pcs : null;
  const candidates = list.fancy.filter((f) => {
    const s = (f.shape || "").toUpperCase();
    return s.startsWith(shape) || norm(f.code).startsWith(shape + ":");
  });
  if (!candidates.length) return "";
  if (per === null || candidates.length === 1) return candidates[0].code;

  const inBand = candidates.find((f) => {
    const [lo, hi] = band(f.pointers);
    return per >= lo && per <= hi;
  });
  return (inBand || candidates[0]).code;
}

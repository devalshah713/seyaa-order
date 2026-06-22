// Column layout + reference data for the "Stock In from Manufacturer" module.
// One finished stock piece = one Stock No., which has several diamond breakup
// lines (different shapes/sizes), like an order's "bags". Stored in a dedicated
// "Stock Entry" tab of the same Google Sheet. Column order/labels match the
// owner-supplied "SINGLE STOCK ENTRY" sample exactly.
import { SHAPE_OPTIONS, DIAMOND_SIZES_BY_SHAPE, MANUFACTURERS } from "./formConfig";
import { parseNum, round2 } from "./diamondIssueConfig";

export { SHAPE_OPTIONS, DIAMOND_SIZES_BY_SHAPE, MANUFACTURERS, parseNum, round2 };

// Sheet tab name (auto-created on first write via the tab-aware sheet actions).
export const STOCK_TAB = "Stock Entry";

// Exact column order from the "SINGLE STOCK ENTRY" sample (A..AA = 27 columns).
export const STOCK_HEADERS = [
  "Stock No.",
  "DATE",
  "DESIGN NAME",
  "Design Number",
  "LOCATION",
  "Gold Details",
  "INCH SIZE",
  "GROSS WEIGHT",
  "NET WEIGHT",
  "TOTAL DIAMOND WEIGHT",
  "DIAMOND WEIGHT BREAKUP",
  "DIA PCS.",
  "TOTAL DIA PCS.",
  "POINTERS",
  "SHAPE",
  "Sieve / Size",
  "Manufacturer Name",
  "Product Code",
  "Diamond Price ($)",
  "Gold Price ($)",
  "Labor ($)",
  "Total ($)",
  "Diamond Price (₹)",
  "Gold Price (₹)",
  "Labor (₹)",
  "Total (₹)",
  "COMMENTS/REMARKS",
] as const;

// Column widths from the sample (sheet1), in STOCK_HEADERS order, so the export
// looks identical to the owner's template.
export const STOCK_WIDTHS: number[] = [
  8, 15.6640625, 15.6640625, 15.6640625, 15.6640625, 15.6640625, 15.6640625,
  15.6640625, 15.6640625, 16.6640625, 18, 15.6640625, 15.6640625, 15.6640625,
  15.6640625, 15.6640625, 15.6640625, 15.6640625, 15.6640625, 15.6640625,
  9.33203125, 10.33203125, 17.88671875, 15.6640625, 9.33203125, 8.44140625,
  22.5546875,
];

// Fields entered once per stone piece (the merged, item-level columns).
// Stock No. and Design Number are the keys and are repeated on every row.
export const STOCK_STONE_HEADERS = [
  "DIAMOND WEIGHT BREAKUP",
  "DIA PCS.",
  "POINTERS",
  "SHAPE",
  "Sieve / Size",
  "Diamond Price ($)",
  "Diamond Price (₹)",
] as const;

// Columns written as numbers (not text) in the export so the sheet sums cleanly.
export const STOCK_NUMERIC = new Set<string>([
  "Stock No.",
  "GROSS WEIGHT",
  "NET WEIGHT",
  "TOTAL DIAMOND WEIGHT",
  "DIAMOND WEIGHT BREAKUP",
  "DIA PCS.",
  "TOTAL DIA PCS.",
  "POINTERS",
  "Diamond Price ($)",
  "Gold Price ($)",
  "Labor ($)",
  "Total ($)",
  "Diamond Price (₹)",
  "Gold Price (₹)",
  "Labor (₹)",
  "Total (₹)",
]);

// Starter options for the free-text "save a new option" fields. Staff-added
// values are merged on top of these (stored in Vercel Blob, like custom sizes).
export const DEFAULT_GOLD_DETAILS = [
  "18KT Yellow",
  "18KT White",
  "18KT Rose",
  "14KT Yellow",
  "14KT White",
  "14KT Rose",
];
export const DEFAULT_LOCATIONS = ["Office", "Showroom", "Safe", "Bharat Diamond Bourse"];
export const DEFAULT_INCH_SIZES = ["6", "6.5", "7", "7.5", "8", "16", "18", "20"];

// POINTERS for a breakup line = carats-per-stone × 100 (1 ct = 100 points).
export function pointerFor(weightBreakup: string | number, pcs: string | number): number {
  const w = parseNum(weightBreakup);
  const p = parseNum(pcs);
  return p > 0 ? round2((w / p) * 100) : 0;
}

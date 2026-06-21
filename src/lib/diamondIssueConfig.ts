// Reference data + column layout for the "Diamond Issue to Manufacturer"
// tracker. Data is stored in a dedicated "Diamond Issue" tab of the same
// Google Sheet. One issue = one Memo No., which can have several diamond
// lines (like an order with several items). Each diamond line becomes one
// row; memo-level totals are written on the memo's first row only.
import { SHAPE_OPTIONS, DIAMOND_SIZES_BY_SHAPE, Field, PRODUCT_TYPES } from "./formConfig";

export { SHAPE_OPTIONS, DIAMOND_SIZES_BY_SHAPE, PRODUCT_TYPES };

// Sheet tab name (must match the Apps Script / Google Sheet tab).
export const DIAMOND_ISSUE_TAB = "Diamond Issue";

// Exact column order, matching the Excel template the owner provided.
export const DIAMOND_ISSUE_HEADERS = [
  "Date",
  "Design Number",
  "Sub Design No",
  "Product",
  "Diamond Shape",
  "SETTING",
  "Certi No.",
  "Diamond Size",
  "Diamond Pcs",
  "Diamond Carats",
  "Cvd/Hpht",
  "Price",
  "Memo No.",
  "Dia Cts Used",
  "Dia Pcs Used",
  "Difference Dia Used",
  "Total Price",
  "Addition of Total Price",
  "Average Price",
  "Status",
  "Received date",
] as const;

export const CVD_HPHT_OPTIONS = ["CVD", "HPHT"];

// Fields entered once per memo (the "issue" header).
export const ISSUE_HEADER_FIELDS: Field[] = [
  { name: "Design Number", inputType: "TEXT", required: true },
  { name: "Sub Design No", inputType: "TEXT" },
  { name: "Memo No.", inputType: "TEXT", required: true },
];

// Fields entered per diamond line at issue time. Product is per line (matching
// the Excel layout) and is auto-filled from the selected order's items.
export const ISSUE_LINE_FIELDS: Field[] = [
  { name: "Product", inputType: "SELECT", options: PRODUCT_TYPES },
  { name: "Diamond Shape", inputType: "SELECT", required: true, options: SHAPE_OPTIONS },
  { name: "SETTING", inputType: "TEXT" },
  { name: "Certi No.", inputType: "TEXT" },
  { name: "Diamond Size", inputType: "SELECT", required: true, optionsByShape: true },
  { name: "Diamond Pcs", inputType: "NUMBER", required: true },
  { name: "Diamond Carats", inputType: "NUMBER", required: true },
  { name: "Cvd/Hpht", inputType: "SELECT", options: CVD_HPHT_OPTIONS },
  { name: "Price", inputType: "NUMBER", required: true },
];

export const ISSUE_HEADER_FIELD_NAMES = ISSUE_HEADER_FIELDS.map((f) => f.name);
export const ISSUE_LINE_FIELD_NAMES = ISSUE_LINE_FIELDS.map((f) => f.name);

// Lifecycle of an issued memo.
export const ISSUE_STATUSES = ["ISSUED", "PARTIAL", "RECEIVED", "CANCELLED"] as const;

export const ISSUE_STATUS_LABELS: Record<string, string> = {
  ISSUED: "Issued",
  PARTIAL: "Partly Received",
  RECEIVED: "Received",
  CANCELLED: "Cancelled",
};

export const ISSUE_STATUS_COLORS: Record<string, string> = {
  ISSUED: "#d97706",
  PARTIAL: "#7c3aed",
  RECEIVED: "#16a34a",
  CANCELLED: "#dc2626",
};

// --- Money / weight maths --------------------------------------------------
// These are the formulas the owner approved. They live in one place so they
// are trivial to adjust later:
//   Total Price        = Price × Diamond Carats          (per line)
//   Difference Dia Used = Diamond Carats − Dia Cts Used   (per line)
//   Addition of Total Price = Σ Total Price               (per memo)
//   Average Price      = Addition of Total Price ÷ Σ Carats (per memo)
export function parseNum(v: string | number | undefined | null): number {
  if (v === undefined || v === null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

// Round to 2 decimals but keep it a clean number (no trailing zeros noise).
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

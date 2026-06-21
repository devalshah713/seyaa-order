// Reference data that drives the order form (orders are stored in a Google
// Sheet). Two groups of fields now:
//   - PRODUCT_FIELDS: filled once per product
//   - DIAMOND_FIELDS: filled per diamond shape; a product can have several
//     diamond blocks ("+ Add diamond shape"). Diamond Size options depend on
//     the chosen shape (see diamondSizes.ts).
import { SHAPE_OPTIONS, DIAMOND_SIZES_BY_SHAPE } from "./diamondSizes";

export { SHAPE_OPTIONS, DIAMOND_SIZES_BY_SHAPE };

export type Field = {
  name: string;
  inputType: "SELECT" | "NUMBER" | "TEXT";
  unit?: string;
  required?: boolean;
  options?: string[];
  // For "Diamond Size": options come from DIAMOND_SIZES_BY_SHAPE based on the
  // block's chosen shape, so `options` is left empty here.
  optionsByShape?: boolean;
};

export const REGIONS: { name: string; currency: string }[] = [
  { name: "USA", currency: "USD" },
  { name: "Dubai", currency: "AED" },
  { name: "Hong Kong", currency: "HKD" },
  { name: "India", currency: "INR" },
];

export const PRODUCT_TYPES = ["Ring", "Necklace", "Bracelet", "Earrings", "Pendant", "Chain"];

export const MANUFACTURERS = [
  "Seyaa Factory",
  "Pratik C6",
  "Sky Jewels",
  "Harshit Sky",
  "Anthem Jewels",
];

// Filled once per product.
export const PRODUCT_FIELDS: Field[] = [
  { name: "Gold Color", inputType: "SELECT", required: true, options: ["Yellow", "White", "Rose", "Two-Tone"] },
  { name: "Gold Karat", inputType: "SELECT", required: true, options: ["10K", "14K", "18K", "21K", "22K", "24K"] },
  { name: "Length", inputType: "NUMBER" },
  { name: "Length Unit", inputType: "SELECT", options: ["mm", "inch"] },
  { name: "Metal Weight (Approx)", inputType: "NUMBER", unit: "g" },
];

// Filled per diamond shape (repeatable block).
export const DIAMOND_FIELDS: Field[] = [
  { name: "Diamond Shape", inputType: "SELECT", required: true, options: SHAPE_OPTIONS },
  { name: "Diamond Size", inputType: "SELECT", required: true, optionsByShape: true },
  { name: "Number of Diamonds", inputType: "NUMBER", required: true },
  { name: "Stone Type", inputType: "SELECT", required: true, options: ["CVD", "HPHT", "CZ", "Polki", "Color Gemstone", "Color CVD Diamond"] },
  { name: "Stone Color", inputType: "TEXT", required: true },
  { name: "Certificate Number", inputType: "TEXT", required: true },
];

export const PRODUCT_FIELD_NAMES = PRODUCT_FIELDS.map((f) => f.name);
export const DIAMOND_FIELD_NAMES = DIAMOND_FIELDS.map((f) => f.name);

// Google Sheet column order. One row per diamond block; products without
// diamonds get a single row with the diamond columns left blank. "Item No"
// distinguishes separate products within the same order.
// "Order Number" stays the underlying key (auto-numbering, status updates and
// the Diamond Issue link all reference it); the UI labels it "Design Number".
// "Sub Design No" is appended at the end so existing rows stay aligned.
export const SHEET_HEADERS = [
  "Order Number",
  "Item No",
  "Date",
  "Status",
  "Region",
  "Customer Name",
  "Manufacturer",
  "Product Type",
  "Quantity",
  ...PRODUCT_FIELD_NAMES,
  ...DIAMOND_FIELD_NAMES,
  "Notes",
  "Photos",
  "Sub Design No",
];

export const ORDER_STATUSES = [
  "NEW",
  "CONFIRMED",
  "IN_PRODUCTION",
  "QC",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
] as const;

export const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  CONFIRMED: "Confirmed",
  IN_PRODUCTION: "In Production",
  QC: "Quality Check",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export const STATUS_COLORS: Record<string, string> = {
  NEW: "#64748b",
  CONFIRMED: "#2563eb",
  IN_PRODUCTION: "#d97706",
  QC: "#7c3aed",
  SHIPPED: "#0891b2",
  DELIVERED: "#16a34a",
  CANCELLED: "#dc2626",
};

export function currencyForRegion(region: string): string {
  return REGIONS.find((r) => r.name === region)?.currency || "";
}

// The Sheet may return the date as a long Date string ("Wed Jun 17 2026
// 16:29:00 GMT+0530 (India Standard Time)"). Trim the timezone tail so the
// displayed wall-clock time stays correct and readable.
export function formatDate(s: string): string {
  if (!s) return "";
  const i = s.indexOf(" GMT");
  return i >= 0 ? s.slice(0, i) : s;
}

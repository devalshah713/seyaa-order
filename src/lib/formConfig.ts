// All the "reference data" that drives the order form. This used to live in
// the database; now that orders are stored in a Google Sheet, this fixed
// configuration lives in code. Editing this file (then merging to main)
// updates the dropdowns on the live site.

export type SpecField = {
  name: string;
  inputType: "SELECT" | "MULTISELECT" | "NUMBER" | "TEXT";
  unit?: string;
  required?: boolean;
  options?: string[];
};

export const REGIONS: { name: string; currency: string }[] = [
  { name: "USA", currency: "USD" },
  { name: "Dubai", currency: "AED" },
  { name: "Hong Kong", currency: "HKD" },
  { name: "India", currency: "INR" },
];

export const PRODUCT_TYPES = [
  "Ring",
  "Necklace",
  "Bracelet",
  "Earrings",
  "Pendant",
  "Chain",
];

// Diamond sizes taken from the round-diamond sieve chart (brand ignored):
// each shows the diameter in mm with its approximate carat weight.
const DIAMOND_SIZES = [
  "-0.80 mm (0.002 ct)",
  "0.80 - 0.90 mm (0.003 ct)",
  "0.90 - 1.00 mm (0.004 ct)",
  "1.00 - 1.10 mm (0.005 ct)",
  "1.10 - 1.15 mm (0.006 ct)",
  "1.15 - 1.20 mm (0.007 ct)",
  "1.20 - 1.25 mm (0.008 ct)",
  "1.25 - 1.30 mm (0.009 ct)",
  "1.30 - 1.35 mm (0.010 ct)",
  "1.35 - 1.40 mm (0.011 ct)",
  "1.40 - 1.45 mm (0.012 ct)",
  "1.45 - 1.50 mm (0.013 ct)",
  "1.50 - 1.55 mm (0.014 ct)",
  "1.55 - 1.60 mm (0.016 ct)",
  "1.60 - 1.70 mm (0.018 ct)",
  "1.70 - 1.80 mm (0.021 ct)",
  "1.80 - 1.90 mm (0.025 ct)",
  "1.90 - 2.00 mm (0.029 ct)",
  "2.00 - 2.10 mm (0.035 ct)",
  "2.10 - 2.20 mm (0.039 ct)",
  "2.20 - 2.30 mm (0.044 ct)",
  "2.30 - 2.40 mm (0.052 ct)",
  "2.40 - 2.50 mm (0.058 ct)",
  "2.50 - 2.60 mm (0.069 ct)",
  "2.60 - 2.70 mm (0.074 ct)",
  "2.70 - 2.80 mm (0.078 ct)",
  "2.80 - 2.90 mm (0.086 ct)",
  "2.90 - 3.00 mm (0.095 ct)",
  "3.00 - 3.10 mm (0.108 ct)",
  "3.10 - 3.20 mm (0.116 ct)",
  "3.20 - 3.30 mm (0.125 ct)",
  "3.30 - 3.40 mm (0.135 ct)",
  "3.40 - 3.50 mm (0.146 ct)",
  "3.50 - 3.60 mm (0.159 ct)",
  "3.60 - 3.70 mm (0.175 ct)",
  "3.80 mm (0.20 ct)",
  "4.1 mm (0.25 ct)",
  "4.5 mm (0.33 ct)",
  "4.8 mm (0.40 ct)",
  "5.2 mm (0.50 ct)",
  "5.8 mm (0.75 ct)",
  "6.5 mm (1.00 ct)",
];

// The specification fields captured for every product (in display order).
// The `name` of each field is also used as its column header in the Sheet.
export const SPEC_FIELDS: SpecField[] = [
  { name: "Gold Color", inputType: "SELECT", required: true, options: ["Yellow", "White", "Rose", "Two-Tone"] },
  { name: "Gold Karat", inputType: "SELECT", required: true, options: ["10K", "14K", "18K", "21K", "22K", "24K"] },
  { name: "Length", inputType: "NUMBER", unit: "mm" },
  {
    name: "Diamond Shape",
    inputType: "MULTISELECT",
    options: ["Round", "Princess", "Oval", "Emerald", "Pear", "Marquise", "Cushion", "Heart", "Radiant", "Asscher", "Baguette", "Trillion"],
  },
  { name: "Diamond Size", inputType: "SELECT", options: DIAMOND_SIZES },
  { name: "Number of Diamonds", inputType: "NUMBER" },
  { name: "Stone Type", inputType: "SELECT", options: ["CVD", "HPHT", "CZ", "Polki", "Color Gemstone", "Color CVD Diamond"] },
  { name: "Stone Color", inputType: "TEXT" },
  { name: "Certificate Number", inputType: "TEXT" },
  { name: "Metal Weight (Approx)", inputType: "NUMBER", unit: "g" },
];

// Status pipeline (kept from before).
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

// The Google Sheet column order. Order-level fields, then per-item fields,
// then Notes. The Apps Script uses the SAME order — keep them in sync.
export const SHEET_HEADERS = [
  "Order Number",
  "Date",
  "Status",
  "Region",
  "Customer Name",
  "Product Type",
  "Quantity",
  ...SPEC_FIELDS.map((f) => f.name),
  "Notes",
];

export function currencyForRegion(region: string): string {
  return REGIONS.find((r) => r.name === region)?.currency || "";
}

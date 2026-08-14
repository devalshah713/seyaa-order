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

// --- SKU building ------------------------------------------------------------
// Example from the paper sheet:
//   SS-NK-SL-KO-20CT-011-015-WG-14KT-USA
//    |  |  |  |   |     |     |   |    `- zone
//    |  |  |  |   |     |     |   `------ gold purity
//    |  |  |  |   |     |     `---------- gold colour
//    |  |  |  |   |     `---------------- pointer range
//    |  |  |  |   `---------------------- carat code
//    |  |  |  `-------------------------- category
//    |  |  `----------------------------- line
//    |  `-------------------------------- product
//    `----------------------------------- brand (constant)

export const BRAND_CODE = "SS";

const PRODUCT_CODES: Record<string, string> = {
  "tennis necklace": "NK",
  necklace: "NK",
  "necklace set": "NS",
  "tennis bracelet": "BR",
  bracelet: "BR",
  ring: "RG",
  earrings: "ER",
  pendant: "PN",
  bangle: "BN",
  chain: "CH",
};

const GOLD_COLOR_CODES: Record<string, string> = {
  "white gold": "WG",
  "yellow gold": "YG",
  "rose gold": "RG",
};

const ZONE_CODES: Record<string, string> = {
  usa: "USA",
  dubai: "DXB",
  "hong kong": "HK",
  india: "IND",
};

// First two letters, uppercased — "Korean Necklace" -> "KO".
function shortCode(value: string, fallback = ""): string {
  const clean = value.replace(/[^A-Za-z0-9]/g, "");
  return clean ? clean.slice(0, 2).toUpperCase() : fallback;
}

export function productCode(product: string): string {
  return PRODUCT_CODES[product.trim().toLowerCase()] || shortCode(product);
}
export function goldColorCode(color: string): string {
  return GOLD_COLOR_CODES[color.trim().toLowerCase()] || shortCode(color);
}
export function zoneCode(zone: string): string {
  return ZONE_CODES[zone.trim().toLowerCase()] || zone.trim().toUpperCase();
}
export function categoryCode(category: string): string {
  return shortCode(category);
}

export type SkuParts = {
  product: string;
  line: string; // e.g. "SL"
  category: string;
  caratCode: string; // e.g. "20CT"
  pointerRange: string; // e.g. "011-015"
  goldColor: string;
  goldPurity: string;
  zone: string;
};

// Joins the segments, skipping any that are still blank so a partly-filled
// form still shows a sensible running SKU.
export function buildSku(p: SkuParts): string {
  const segments = [
    BRAND_CODE,
    productCode(p.product),
    p.line.trim().toUpperCase(),
    categoryCode(p.category),
    p.caratCode.trim().toUpperCase(),
    p.pointerRange.trim(),
    goldColorCode(p.goldColor),
    p.goldPurity.trim().toUpperCase(),
    zoneCode(p.zone),
  ];
  return segments.filter(Boolean).join("-");
}

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

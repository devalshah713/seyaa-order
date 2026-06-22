// India price master for Stock In, decoded from the owner's "Stock Sheet New For
// India" rate card. Each product code carries a per-carat Price ($) and Price
// (₹); selecting a code on a diamond breakup line multiplies that price by the
// line's carat weight to fill the line's Diamond Price ($)/(₹).
//
// Gold and Labour rates are per gram of the piece (by karat); Polki pieces use
// the Polki Labour rate.

export type PriceCategory = "Round" | "Fancy" | "Gem" | "Polki";
export type PriceEntry = {
  code: string;
  label: string; // sieve (Round) or shape/size (others)
  category: PriceCategory;
  usd: number; // per carat
  inr: number; // per carat
  polki?: boolean;
};

// --- Round diamonds: [code, sieve, $, ₹] (per carat) ----------------------
const ROUND: [string, string, number, number][] = [
  ["10/2 : 01", "10/2 Certified", 250, 20000],
  ["8/2 : 01", "8/2", 200, 15000],
  ["6/2 : 01", "6/2", 200, 15000],
  ["4/2 : 01", "4/2", 180, 15000],
  ["6/4 : 01", "6/4", 160, 15000],
  ["4/4 : 02", "4/4", 120, 15000],
  ["4/4 : 01", "4/4", 120, 10500],
  ["7/8 : 02", "7/8", 100, 10500],
  ["7/8 : 01", "7/8", 100, 9000],
  ["3/4 : 05", "3/4", 100, 9000],
  ["3/4 : 04", "3/4", 100, 9000],
  ["3/4 : 03", "3/4", 100, 9000],
  ["3/4 : 02", "3/4", 100, 9000],
  ["3/4 : 01", "3/4", 100, 9000],
  ["5/8 : 03", "5/8", 100, 9000],
  ["5/8 : 02", "5/8", 100, 9000],
  ["5/8 : 01", "5/8", 100, 9000],
  ["1/2 : 03", "1/2", 100, 8500],
  ["1/2 : 02", "1/2", 100, 8500],
  ["1/2 : 01", "1/2", 100, 8500],
  ["3/8 : 04", "3/8", 100, 8500],
  ["3/8 : 03", "3/8", 100, 8500],
  ["3/8 : 02", "3/8", 100, 8500],
  ["3/8 : 01", "3/8", 100, 8500],
  ["+19-20 : 02", "+19.5-20", 100, 7500],
  ["+19-20 : 01", "+19-19.5", 100, 7500],
  ["+17-19 : 04", "+18.5-19", 100, 7500],
  ["+17-19 : 03", "+18-18.5", 100, 7500],
  ["+17-19 : 02", "+17.5-18", 100, 7500],
  ["+17-19 : 01", "+17-17.5", 100, 7500],
  ["+16-17 : 02", "+16.5-17", 100, 7000],
  ["+16-17 : 01", "+16-16.5", 100, 7000],
  ["+15-16 : 02", "+15.5-16", 100, 7000],
  ["+15-16 : 01", "+15-15.5", 100, 7000],
  ["+14-15 : 02", "+14.5-15", 100, 7000],
  ["+14-15 : 01", "+14-14.5", 100, 7000],
  ["+11-14 : 06", "+13.5-14", 78, 7000],
  ["+11-14 : 05", "+13-13.5", 78, 7000],
  ["+11-14 : 04", "+12.5-13", 82, 7000],
  ["+11-14 : 03", "+12-12.5", 82, 7000],
  ["+11-14 : 02", "+11.5-12", 75, 7000],
  ["+11-14 : 01", "+11-11.5", 75, 7000],
  ["+6.5-11 : 09", "+10.5-11", 75, 7000],
  ["+6.5-11 : 08", "+10-10.5", 75, 7000],
  ["+6.5-11 : 07", "+9.5-10", 75, 7000],
  ["+6.5-11 : 06", "+9-9.5", 75, 7000],
  ["+6.5-11 : 05", "+8.5-9", 82, 7000],
  ["+6.5-11 : 04", "+8-8.5", 82, 7000],
  ["+6.5-11 : 03", "+7.5-8", 95, 7000],
  ["+6.5-11 : 02", "+7-7.5", 95, 7000],
  ["+6.5-11 : 01", "+6.5-7", 95, 7000],
  ["+2-6.5 : 09", "+6-6.5", 110, 7750],
  ["+2-6.5 : 08", "+5.5-6", 110, 7750],
  ["+2-6.5 : 07", "+5-5.5", 110, 7750],
  ["+2-6.5 : 06", "+4.5-5", 110, 7750],
  ["+2-6.5 : 05", "+4-4.5", 110, 7750],
  ["+2-6.5 : 04", "+3.5-4", 110, 9000],
  ["+2-6.5 : 03", "+3-3.5", 110, 9000],
  ["+2-6.5 : 02", "+2.5-3", 110, 9000],
  ["+2-6.5 : 01", "+2-2.5", 110, 9000],
  ["-2 : 06", "+1.5-2", 160, 11000],
  ["-2 : 05", "+1-1.5", 160, 11000],
  ["-2 : 04", "+0-1", 160, 11000],
  ["-2 : 03", "+00-0", 160, 15000],
  ["-2 : 02", "+000-00", 160, 15000],
  ["-2 : 01", "+0000-000", 160, 15000],
];

// --- Fancy shapes: each has :01 (0.01-0.99 ct) and :02 (1.00-4.99 ct) ------
// All are $130/ct; ₹11500/ct for :01 and ₹13000/ct for :02.
const FANCY_SHAPES: [string, string][] = [
  ["EM", "Emerald"],
  ["PR", "Princess"],
  ["BG", "Baguette"],
  ["TAP", "Tapered Baguette"],
  ["TR", "Trilliant"],
  ["TRI", "Triangle"],
  ["AS", "Asscher"],
  ["RAD", "Radiant"],
  ["MQ", "Marquise"],
  ["OV", "Oval"],
  ["CU", "Cushion"],
  ["PE", "Pear (Pan)"],
  ["KI", "Kite"],
  ["CH", "Chill"],
  ["PEN", "Pentagon"],
  ["HEX", "Hexagon"],
  ["OC", "Octagon"],
  ["BA", "Barrel"],
  ["SH", "Shield"],
  ["LOZ", "Lozenge"],
  ["BU", "Bullet"],
  ["KE", "Keystone"],
  ["HEB", "Hexagon Bullet"],
  ["HE", "Heart"],
];

// Fancy specials + non-carat gem codes: [code, label, $, ₹].
const FANCY_SPECIAL: [string, string, number, number][] = [
  ["OV : 03", "Oval (10.00-10.99 ct)", 250, 20000],
  ["OV : 04", "Oval Pink (10.00-10.99 ct)", 250, 21000],
  ["NEM : 01", "Natural EM", 10, 800],
  ["GM : 01", "Natural Gun Metal", 245, 22000],
  ["CZ : 01", "CZ", 10, 500],
];

// --- Gem / other stones: [code, name, $, ₹] -------------------------------
const GEM: [string, string, number, number][] = [
  ["MOTI : 01", "Moti", 5, 300],
  ["ME : 01", "Meena", 15, 1000],
  ["DA : 01", "Dak", 5, 120],
  ["CS : 01", "Color Stone", 11, 500],
  ["CS : 02", "Color Stone (large)", 60, 3000],
  ["WP : 01", "Water Pearl", 10, 500],
  ["TRIG : 01", "Triangle Gem Stone", 15, 1000],
];

// --- Lab Polki: [code, size, $, ₹] (polki) --------------------------------
const POLKI: [string, string, number, number][] = [
  ["PO : 01", "Lab Polki +10-24", 35, 3000],
  ["PO : 02", "Lab Polki +24-50", 38, 4000],
  ["PO : 03", "Lab Polki +50-1.50", 40, 4500],
  ["PO : 04", "Lab Polki 2 Ct.", 45, 5000],
  ["PO : 05", "Lab Polki 3 Ct.", 70, 5500],
];

function build(): PriceEntry[] {
  const out: PriceEntry[] = [];
  for (const [code, sieve, usd, inr] of ROUND) out.push({ code, label: `Round ${sieve}`, category: "Round", usd, inr });
  for (const [abbr, shape] of FANCY_SHAPES) {
    out.push({ code: `${abbr} : 01`, label: `${shape} (0.01-0.99 ct)`, category: "Fancy", usd: 130, inr: 11500 });
    out.push({ code: `${abbr} : 02`, label: `${shape} (1.00-4.99 ct)`, category: "Fancy", usd: 130, inr: 13000 });
  }
  for (const [code, label, usd, inr] of FANCY_SPECIAL) out.push({ code, label, category: "Fancy", usd, inr });
  for (const [code, label, usd, inr] of GEM) out.push({ code, label, category: "Gem", usd, inr });
  for (const [code, label, usd, inr] of POLKI) out.push({ code, label, category: "Polki", usd, inr, polki: true });
  return out;
}

export const PRICE_LIST: PriceEntry[] = build();
export const PRICE_CODES: string[] = PRICE_LIST.map((p) => p.code);

const BY_CODE: Record<string, PriceEntry> = Object.fromEntries(PRICE_LIST.map((p) => [p.code, p]));
export function findPrice(code: string): PriceEntry | undefined {
  return code ? BY_CODE[code.trim()] : undefined;
}
export function isPolkiCode(code: string): boolean {
  return !!findPrice(code)?.polki;
}

// --- Gold & Labour rates (per gram) ---------------------------------------
export const GOLD_RATES: Record<string, { usd: number; inr: number }> = {
  "14KT": { usd: 106, inr: 9798 },
  "18KT": { usd: 145, inr: 12488 },
};
export const LABOUR_RATES = {
  normal: { usd: 14, inr: 1199 },
  polki: { usd: 18, inr: 1499 },
};

// Detect the karat key from a free-text Gold Details value ("18KT Yellow" → 18KT).
export function karatFromGoldDetails(goldDetails: string): "14KT" | "18KT" | null {
  const s = (goldDetails || "").toLowerCase();
  if (s.includes("18")) return "18KT";
  if (s.includes("14")) return "14KT";
  return null;
}

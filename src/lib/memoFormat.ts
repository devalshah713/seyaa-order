// Pure helpers shared by both client (form preview) and server (store, views).
// No server-only imports here so it can be bundled either side.

export const JEWELLERY_TYPES = [
  "Ring",
  "Earrings",
  "Pendant",
  "Bracelet",
  "Necklace",
  "Necklace Set",
] as const;

export const PURPOSES = ["Sell", "Memo", "Repair", "Export"] as const;

export const COMPANY = {
  name: "Seyaa Solitaire",
  tagline: "Fine Diamond Jewellery",
  address:
    "DE-8082, Bharat Diamond Bourse, Bandra Kurla Complex, Bandra East, Mumbai – 400051",
};

export function pad(n: number, width = 3): string {
  let s = String(n);
  while (s.length < width) s = "0" + s;
  return s;
}

// Indian fiscal year (April–March) as "26-27" from a yyyy-mm-dd string.
export function fyFromInput(dateInput: string): string {
  const d = parseInput(dateInput);
  const y = d.getFullYear();
  const start = d.getMonth() >= 3 ? y : y - 1; // April = month 3
  return String(start).slice(2) + "-" + String(start + 1).slice(2);
}

export function memoNoFor(fy: string, seq: number): string {
  return `SS/${fy}/${pad(seq)}`;
}

export function memoIdFor(fy: string, seq: number): string {
  return `SS-${fy}-${pad(seq)}`;
}

// Parse a yyyy-mm-dd input into a local Date (falls back to today).
export function parseInput(dateInput: string): Date {
  if (dateInput) {
    const p = dateInput.split("-");
    if (p.length === 3) return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  return new Date();
}

export function todayInput(): string {
  const d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1, 2) + "-" + pad(d.getDate(), 2);
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export function formatDate(dateInput: string): string {
  const d = parseInput(dateInput);
  return pad(d.getDate(), 2) + " " + MONTHS[d.getMonth()] + " " + d.getFullYear();
}

// Split a free-text box into clean, 6-char alphanumeric stock codes.
export function parseCodes(raw: string): string[] {
  return String(raw)
    .split(/[\s,;]+/)
    .map((c) => c.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6))
    .filter((c) => c.length > 0);
}

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

// Two kinds of memo share one layout, terms and signature block. Jewellery
// moves as counted pieces with stock numbers; gold moves as weight at a purity,
// out to a factory and back again.
export type MemoKind = "jewellery" | "gold";

export const GOLD_PURPOSES = ["Issue to Factory", "Receipt from Factory"] as const;

// Common shapes sent out for casting or manufacturing. Free text is allowed
// too — this is only to save typing the usual ones.
export const GOLD_FORMS = [
  "Fine Gold Bar",
  "Casting Grain",
  "Sheet",
  "Wire",
  "Scrap / Old Gold",
  "Findings",
  "Finished Casting",
] as const;

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

// Gold runs its own book: SG/26-27/001 alongside SS/26-27/001, so the two
// sequences stay independent and separately auditable.
export function goldMemoNoFor(fy: string, seq: number): string {
  return `SG/${fy}/${pad(seq)}`;
}

export function goldMemoIdFor(fy: string, seq: number): string {
  return `SG-${fy}-${pad(seq)}`;
}

export function memoNoForKind(kind: MemoKind, fy: string, seq: number): string {
  return kind === "gold" ? goldMemoNoFor(fy, seq) : memoNoFor(fy, seq);
}

export function memoIdForKind(kind: MemoKind, fy: string, seq: number): string {
  return kind === "gold" ? goldMemoIdFor(fy, seq) : memoIdFor(fy, seq);
}

// Counter key for a kind. Jewellery keeps the bare fiscal year it has always
// used so existing numbering is untouched; gold gets its own namespace.
export function counterKey(kind: MemoKind, fy: string): string {
  return kind === "gold" ? `G:${fy}` : fy;
}

// Touch is written either as a percentage (91.60) or per mille (916). Accept
// both: anything above 100 is read as per mille.
export function normalizeTouch(raw: string | number): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/[^0-9.]/g, ""));
  if (!isFinite(n) || n <= 0) return 0;
  return n > 100 ? n / 10 : n;
}

export function parseWeight(raw: string | number): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/[^0-9.]/g, ""));
  return isFinite(n) && n > 0 ? n : 0;
}

// Fine (pure) weight = gross x touch. Rounded to milligrams, which is the
// finest a trade scale reads.
export function fineWeight(gross: string | number, touch: string | number): number {
  const g = parseWeight(gross);
  const t = normalizeTouch(touch);
  if (!g || !t) return 0;
  return Math.round(((g * t) / 100) * 1000) / 1000;
}

// Weights print to 3 decimals; blank rather than "0.000" when empty.
export function fmtWeight(n: number): string {
  return n > 0 ? n.toFixed(3) : "";
}

export function fmtTouch(n: number): string {
  return n > 0 ? n.toFixed(2) : "";
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

// ---------------------------------------------------------------------------
// Orders
//
// Orders arrive over WhatsApp and are keyed in here. They are separate from
// memos: a memo moves existing stock, an order is something still being made.
// ---------------------------------------------------------------------------

export type OrderStatus = "in_production" | "shipped" | "delivered";

export const ORDER_STATUSES: { value: OrderStatus; label: string }[] = [
  { value: "in_production", label: "In Production" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
];

export function orderStatusLabel(s: OrderStatus): string {
  return ORDER_STATUSES.find((x) => x.value === s)?.label ?? "In Production";
}

// Delivered orders leave the shared board; these are the ones still live.
export const OPEN_STATUSES: OrderStatus[] = ["in_production", "shipped"];

export const GOLD_COLORS = [
  "Yellow",
  "White",
  "Rose",
  "Two Tone",
  "Three Tone",
] as const;

// A note against an order — "customer wants 18 inch", "delayed, stones short".
// Append-only, like the stock trail: a later note supersedes an earlier one in
// meaning, but never erases it.
export type OrderComment = {
  id: string;
  text: string;
  at: string; // ISO
  by: string; // username
};

export function orderNoFor(fy: string, seq: number): string {
  return `ORD/${fy}/${pad(seq)}`;
}

export function orderIdFor(fy: string, seq: number): string {
  return `ORD-${fy}-${pad(seq)}`;
}

// ---------------------------------------------------------------------------
// Stock movement
//
// A memo records goods going out. What became of each individual piece is kept
// as an append-only list of events: correcting a mistake adds another event
// rather than editing the old one, so the trail always shows what was recorded,
// when, and by whom. A piece with no event is still out.
// ---------------------------------------------------------------------------

export type StockOutcome = "returned" | "delivered" | "sold" | "exchanged" | "lost";

export type StockEvent = {
  id: string;
  memoId: string;
  memoNo: string;
  stockNo: string;
  outcome: StockOutcome;
  replacedBy?: string; // for "exchanged": the stock number given instead
  note?: string;
  onDate?: string; // yyyy-mm-dd — when the goods actually moved
  at: string; // ISO — when it was keyed in, which can be a day or two later
  by: string; // username that recorded it
};

// The date the movement happened. Falls back to the recording time for events
// saved before the two were kept apart.
export function eventDate(e: StockEvent): string {
  return e.onDate || e.at.slice(0, 10);
}

export const STOCK_OUTCOMES: { value: StockOutcome; label: string; hint: string }[] = [
  { value: "returned", label: "Returned", hint: "Came back to you and is in stock again" },
  { value: "delivered", label: "Delivered", hint: "Handed over for good — not coming back, not yet billed" },
  { value: "sold", label: "Sold", hint: "Kept by the party and billed" },
  { value: "exchanged", label: "Exchanged", hint: "Swapped for a different stock number" },
  { value: "lost", label: "Lost / damaged", hint: "Written off, with a note" },
];

export function outcomeLabel(o: StockOutcome | null): string {
  return STOCK_OUTCOMES.find((x) => x.value === o)?.label ?? "Still out";
}

export type StockLine = {
  stockNo: string;
  type: string;
  outcome: StockOutcome | null; // null: still out
  event?: StockEvent;
};

// Current state of every piece on a memo. Later events win, so a correction
// recorded afterwards supersedes an earlier mistake without erasing it.
export function linesFor(
  memoId: string,
  items: { type: string; stockNos: string[] }[],
  events: StockEvent[]
): StockLine[] {
  const latest = new Map<string, StockEvent>();
  for (const e of events) {
    if (e.memoId !== memoId) continue;
    const prev = latest.get(e.stockNo);
    if (!prev || prev.at <= e.at) latest.set(e.stockNo, e);
  }
  return items.flatMap((it) =>
    it.stockNos.map((stockNo) => {
      const event = latest.get(stockNo);
      return { stockNo, type: it.type, outcome: event?.outcome ?? null, event };
    })
  );
}

export type MemoStatus = "out" | "partial" | "closed";

export function statusOf(lines: StockLine[]): MemoStatus {
  if (!lines.length) return "closed";
  const settled = lines.filter((l) => l.outcome).length;
  if (settled === 0) return "out";
  return settled === lines.length ? "closed" : "partial";
}

export function statusLabel(s: MemoStatus, lines: StockLine[]): string {
  if (s === "closed") return "Closed";
  if (s === "out") return "Out";
  return `${lines.filter((l) => l.outcome).length} of ${lines.length} settled`;
}

// Split a free-text box into clean, 6-char alphanumeric stock codes.
export function parseCodes(raw: string): string[] {
  return String(raw)
    .split(/[\s,;]+/)
    .map((c) => c.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6))
    .filter((c) => c.length > 0);
}

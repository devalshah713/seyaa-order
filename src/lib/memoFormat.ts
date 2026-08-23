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
// Parties
//
// The people and firms goods are issued to. Kept as a controlled list because
// free text produced "Ghanshyam bhai" and "Ghamshyam bhai" as separate parties,
// which makes a ledger impossible to total honestly. Admins curate the list;
// everyone else picks from it.
// ---------------------------------------------------------------------------

// The controlled lists — every set of names staff may choose from but not
// invent. They are all the same shape, so they are all one thing with a kind
// rather than six separate stores and six separate admin screens.
//
// A party saved before kinds existed has none, and is a memo party.
export type PartyKind =
  | "party" | "mfg" | "category" | "subCategory" | "subSubCategory" | "type";

export type Party = {
  id: string;
  name: string;
  kind?: PartyKind;
  // The entry this one sits under, for the lists that are a tree rather than a
  // flat set: a sub-category belongs to a category, a sub-sub to a sub. Held by
  // id so renaming a parent keeps its children.
  parentId?: string;
  createdAt: string;
  createdBy: string;
};

// `parent` is the list an entry hangs off. Three of these are one chain —
// Bracelet, then Tennis Bracelet, then All Mix Fancy — so choosing a category
// on a PD sheet narrows what the next box offers.
export const PARTY_KINDS: {
  key: PartyKind; label: string; noun: string; blurb: string;
  parent?: PartyKind;
}[] = [
  { key: "party", label: "Memo parties", noun: "party",
    blurb: "Who a memo can be issued to." },
  { key: "mfg", label: "Manufacturers", noun: "manufacturer",
    blurb: "Who a PD sheet can be assigned to." },
  { key: "category", label: "Categories", noun: "category",
    blurb: "The top of the chain on a PD sheet — Bracelet, Necklace, Ring." },
  { key: "subCategory", label: "Sub-categories", noun: "sub-category",
    parent: "category",
    blurb: "Under a category: Bracelet → Tennis Bracelet. Only the ones under the chosen category are offered." },
  { key: "subSubCategory", label: "Sub-sub-categories", noun: "sub-sub-category",
    parent: "subCategory",
    blurb: "Under a sub-category: Tennis Bracelet → All Mix Fancy (AMF)." },
  { key: "type", label: "Types", noun: "type",
    blurb: "The Type box on a PD sheet." },
];

export const parentKindOf = (kind: PartyKind): PartyKind | undefined =>
  PARTY_KINDS.find((k) => k.key === kind)?.parent;

export const isPartyKind = (v: unknown): v is PartyKind =>
  typeof v === "string" && PARTY_KINDS.some((k) => k.key === v);

export const partyKindOf = (p: Party): PartyKind => p.kind || "party";

// What each list starts as. Written in the first time that list is read, so
// every screen works from day one; after that the list is the admin's, and a
// name removed is not put back.
export const SEED_MFGS = [
  "Seyaa Factory",
  "Pratik C6",
  "Rajkumar - Zaveri Bazaar",
  "Rakesh Babu - Zaveri Bazaar",
  "Sky Jewels",
  "Anthem Jewels",
];

// Only the lists that start with something. Products, categories and types
// start empty on purpose: Seyaa's own are being entered, and a built-in set
// would have to be cleared out first.
export const SEED_LISTS: Partial<Record<PartyKind, readonly string[]>> = {
  mfg: SEED_MFGS,
};

// Names are compared with case, spacing and punctuation ignored, so
// "seyya soli ( hardik)" cannot be added alongside "Seyya Soli (Hardik)".
export function partyKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// --- Matching a typed name to one on the list --------------------------------
// Memos written before the list existed carry whatever was typed that day:
// "ghanshyambhai", "Ghanshyam bhai ", "GHANSHYAMBHAI JI". Sorting them out by
// eye across years of memos is the job nobody does, so the likely match is
// worked out and offered.

// Spacing is the commonest difference, so it is taken out entirely.
const squash = (name: string) => partyKey(name).replace(/ /g, "");

// How many single-character edits turn one string into the other. Bounded
// work: these are names, not documents.
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = row;
  }
  return prev[b.length];
}

// 1 is the same name, 0 is nothing in common.
export function nameCloseness(a: string, b: string): number {
  const x = squash(a);
  const y = squash(b);
  if (!x || !y) return 0;
  if (x === y) return 1;

  const [short, long] = x.length <= y.length ? [x, y] : [y, x];

  // The shorter is how the longer starts: "Rakesh Babu" written on an old memo
  // against "Rakesh Babu - Zaveri Bazaar" on the list. Scored on the match
  // rather than on the tail, because a long suffix is exactly what was left
  // off. Six characters in, so initials and single words like "Bhai" do not
  // reach for a name that merely begins with them.
  if (long.startsWith(short) && short.length >= 6) return 0.85;

  // Otherwise contained but not from the start, which is weaker.
  if (long.includes(short) && short.length >= 4) {
    return 0.9 * (short.length / long.length) + 0.1;
  }

  const distance = editDistance(x, y);
  return Math.max(0, 1 - distance / Math.max(x.length, y.length));
}

// The listed name a typed one most likely meant, or null when nothing is close
// enough to suggest. Deliberately shy: a wrong suggestion acted on in bulk is
// worse than no suggestion.
export function closestName(
  typed: string,
  listed: readonly string[],
  floor = 0.72
): { name: string; score: number } | null {
  let best: { name: string; score: number } | null = null;
  for (const name of listed) {
    const score = nameCloseness(typed, name);
    if (!best || score > best.score) best = { name, score };
  }
  return best && best.score >= floor ? best : null;
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

// One tall image of everything becomes unreadable once WhatsApp scales it to
// a phone's width, so the board is split into parts of this size.
export const ORDERS_PER_IMAGE = 9;

export function imagePartCount(openOrders: number): number {
  return Math.max(1, Math.ceil(openOrders / ORDERS_PER_IMAGE));
}

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

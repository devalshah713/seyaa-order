// Persistent memo store backed by Vercel Blob. The whole database (a running
// counter per fiscal year + every memo) lives in one JSON blob at a stable
// path. Reads bypass the CDN cache so a freshly saved memo is visible at once.
//
// Numbering is authoritative here on the server: createMemo() reads the DB,
// takes the next serial for the memo's fiscal year, and writes it back. For a
// single-office workflow this read-modify-write is safe; if two memos are ever
// saved in the very same instant the second simply retries onto a fresh read.
import "server-only";
import { get, put, BlobNotFoundError } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import {
  counterKey,
  fyFromInput,
  linesFor,
  memoIdForKind,
  memoNoForKind,
  orderIdFor,
  orderNoFor,
  partyKey,
  todayInput,
  type MemoKind,
  type OrderComment,
  type OrderStatus,
  type Party,
  type StockEvent,
  type StockOutcome,
  SEED_LISTS,
  closestName,
  partyKindOf,
  parentKindOf,
  type PartyKind,
} from "./memoFormat";

const DB_PATH = "memos/db.json";

export type MemoItem = { type: string; stockNos: string[] };

// A row on a gold memo: what was sent, at what purity, and how much of it.
// fineWt is derived (gross x touch) but stored so a saved memo always prints
// exactly the figures it was signed with.
export type GoldItem = {
  description: string;
  touch: number; // percentage, e.g. 91.60
  grossWt: number; // grams
  fineWt: number; // grams
};

export type Memo = {
  id: string; // URL-safe, e.g. "SS-26-27-001" or "SG-26-27-001"
  memoNo: string; // printed, e.g. "SS/26-27/001" or "SG/26-27/001"
  kind: MemoKind; // memos saved before gold existed are read as "jewellery"
  fy: string;
  seq: number;
  to: string;
  through: string;
  mobile: string;
  date: string; // yyyy-mm-dd
  purpose: string;
  comment: string;
  items: MemoItem[]; // jewellery rows (empty on a gold memo)
  goldItems: GoldItem[]; // gold rows (empty on a jewellery memo)
  againstMemoNo?: string; // on a Receipt: the Issue memo it settles
  totalPcs: number;
  totalGrossWt: number;
  totalFineWt: number;
  createdAt: string; // ISO
  updatedAt?: string; // ISO — set on create and every edit; drives incremental backup
  driveLink?: string; // Google Drive webViewLink, once uploaded
};

export type NewMemo = Omit<
  Memo,
  "id" | "memoNo" | "fy" | "seq" | "totalPcs" | "totalGrossWt" | "totalFineWt" | "createdAt"
>;

export type { StockEvent, StockOutcome } from "./memoFormat";

// An order taken over WhatsApp: something still being made, as opposed to a
// memo, which moves stock that already exists.
export type Order = {
  id: string;
  orderNo: string;
  fy: string;
  seq: number;
  customer: string;
  productName: string;
  goldColor: string;
  diamondCts: number; // total carat weight
  pcs: number;
  stockNo?: string; // set when an existing piece is being remade
  status: OrderStatus;
  comments: OrderComment[];
  createdAt: string;
  updatedAt?: string;
};

export type NewOrder = Omit<Order, "id" | "orderNo" | "fy" | "seq" | "createdAt" | "comments">;

export type DB = {
  counters: Record<string, number>;
  memos: Memo[];
  events: StockEvent[];
  orders: Order[];
  parties: Party[];
  // Set once a list's built-in names have been written in, so removing one does
  // not bring it back on the next read. `mfgSeeded` is the first version of
  // this, kept so a store written by it is not seeded twice.
  mfgSeeded?: boolean;
  seeded?: Partial<Record<PartyKind, boolean>>;
};

export function isStorageConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

function requireToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error(
      "Memo storage is not configured. Add the BLOB_READ_WRITE_TOKEN environment variable in Vercel and redeploy."
    );
  }
  return token;
}

async function readDB(token: string): Promise<DB> {
  try {
    // Private store: read the content via the SDK (a plain public fetch is
    // rejected). useCache:false so a just-saved memo is visible immediately.
    const result = await get(DB_PATH, { access: "private", token, useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return { counters: {}, memos: [], events: [], orders: [], parties: [] };
    }
    const db = (await new Response(result.stream).json()) as Partial<DB>;
    return {
      counters: db.counters || {},
      memos: (db.memos || []).map(normalize),
      events: db.events || [],
      orders: db.orders || [],
      parties: db.parties || [],
    };
  } catch (err) {
    // First run: the DB blob doesn't exist yet.
    if (err instanceof BlobNotFoundError) return { counters: {}, memos: [], events: [], orders: [], parties: [] };
    throw err;
  }
}

async function writeDB(db: DB, token: string): Promise<void> {
  await put(DB_PATH, JSON.stringify(db), {
    access: "private",
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

function totalOf(items: MemoItem[]): number {
  return items.reduce((n, it) => n + it.stockNos.length, 0);
}

function sumBy(rows: GoldItem[], pick: (r: GoldItem) => number): number {
  // Weights add in milligrams to avoid float drift across many rows.
  return Math.round(rows.reduce((n, r) => n + (pick(r) || 0), 0) * 1000) / 1000;
}

// Memos written before gold memos existed have no kind and no gold fields.
// Fill them in on read so the rest of the app never has to special-case age.
function normalize(m: Memo): Memo {
  return {
    ...m,
    kind: m.kind === "gold" ? "gold" : "jewellery",
    items: m.items || [],
    goldItems: m.goldItems || [],
    totalPcs: m.totalPcs || 0,
    totalGrossWt: m.totalGrossWt || 0,
    totalFineWt: m.totalFineWt || 0,
  };
}

export async function createMemo(input: NewMemo): Promise<Memo> {
  const token = requireToken();
  const db = await readDB(token);

  const date = input.date || todayInput();
  const fy = fyFromInput(date);
  const kind: MemoKind = input.kind === "gold" ? "gold" : "jewellery";
  const key = counterKey(kind, fy);
  const seq = (db.counters[key] || 0) + 1;
  db.counters[key] = seq;

  const items = kind === "gold" ? [] : input.items || [];
  const goldItems = kind === "gold" ? input.goldItems || [] : [];

  const memo: Memo = {
    id: memoIdForKind(kind, fy, seq),
    memoNo: memoNoForKind(kind, fy, seq),
    kind,
    fy,
    seq,
    to: input.to,
    through: input.through,
    mobile: input.mobile,
    date,
    purpose: input.purpose,
    comment: input.comment,
    items,
    goldItems,
    againstMemoNo: input.againstMemoNo || undefined,
    totalPcs: totalOf(items),
    totalGrossWt: sumBy(goldItems, (r) => r.grossWt),
    totalFineWt: sumBy(goldItems, (r) => r.fineWt),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.memos.push(memo);
  await writeDB(db, token);
  return memo;
}

// Next serial for a given date's fiscal year — for the live form preview only.
export async function peekNextMemoNo(dateInput: string, kind: MemoKind = "jewellery"): Promise<string> {
  const token = requireToken();
  const db = await readDB(token);
  const fy = fyFromInput(dateInput || todayInput());
  return memoNoForKind(kind, fy, (db.counters[counterKey(kind, fy)] || 0) + 1);
}

// Issue memos a Receipt can be booked against, newest first.
export async function listOpenIssues(): Promise<{ memoNo: string; to: string; date: string }[]> {
  const token = requireToken();
  const db = await readDB(token);
  return db.memos
    .filter((m) => m.kind === "gold" && m.purpose === "Issue to Factory")
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((m) => ({ memoNo: m.memoNo, to: m.to, date: m.date }));
}

export async function listMemos(): Promise<Memo[]> {
  const token = requireToken();
  const db = await readDB(token);
  // Newest first.
  return db.memos.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getMemo(id: string): Promise<Memo | null> {
  const token = requireToken();
  const db = await readDB(token);
  return db.memos.find((m) => m.id === id) || null;
}

// ---------------------------------------------------------------------------
// Parties
// ---------------------------------------------------------------------------

export async function listParties(kind: PartyKind = "party"): Promise<Party[]> {
  const token = requireToken();
  let db = await readDB(token);
  if (await seedList(db, kind, token)) db = await readDB(token);
  return db.parties
    .filter((p) => partyKindOf(p) === kind)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Several lists at once, for a screen that needs more than one — one read of
// the store instead of one per list.
export type ListEntry = { name: string; parent: string };

export async function listPartyNames(
  kinds: PartyKind[]
): Promise<Record<string, ListEntry[]>> {
  const token = requireToken();
  let db = await readDB(token);
  let wrote = false;
  for (const kind of kinds) wrote = (await seedList(db, kind, token)) || wrote;
  if (wrote) db = await readDB(token);

  // The parent goes out by name, not id: a form holds what was chosen, not the
  // row it came from, so the name is what it can filter on.
  const nameById = new Map(db.parties.map((p) => [p.id, p.name]));
  const out: Record<string, ListEntry[]> = {};
  for (const kind of kinds) {
    out[kind] = db.parties
      .filter((p) => partyKindOf(p) === kind)
      .map((p) => ({
        name: p.name,
        parent: (p.parentId && nameById.get(p.parentId)) || "",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  return out;
}

// Writes a list's built-in names in, once. Returns whether it wrote.
async function seedList(db: DB, kind: PartyKind, token: string): Promise<boolean> {
  const seed = SEED_LISTS[kind];
  if (!seed) return false;
  // mfgSeeded is the flag the first version of this used.
  if (db.seeded?.[kind] || (kind === "mfg" && db.mfgSeeded)) return false;

  const now = new Date().toISOString();
  for (const name of seed) {
    const clash = db.parties.some(
      (p) => partyKindOf(p) === kind && partyKey(p.name) === partyKey(name)
    );
    if (clash) continue;
    db.parties.push({
      id: randomUUID(), name, kind, createdAt: now, createdBy: "system",
    });
  }
  db.seeded = { ...db.seeded, [kind]: true };
  if (kind === "mfg") db.mfgSeeded = true;
  await writeDB(db, token);
  return true;
}

// Empties a list. Also marks it seeded, so a list whose built-in names were
// just cleared out does not have them written back on the next read.
export async function clearParties(kind: PartyKind): Promise<number> {
  const token = requireToken();
  const db = await readDB(token);
  const before = db.parties.length;
  const gone = new Set(
    db.parties.filter((p) => partyKindOf(p) === kind).map((p) => p.id)
  );
  // Everything under them goes too — a sub-category with no category above it
  // can never be offered again.
  db.parties = db.parties.filter(
    (p) => partyKindOf(p) !== kind && !(p.parentId && gone.has(p.parentId))
  );
  db.seeded = { ...db.seeded, [kind]: true };
  if (kind === "mfg") db.mfgSeeded = true;
  await writeDB(db, token);
  return before - db.parties.length;
}

export async function createParty(
  name: string,
  by: string,
  kind: PartyKind = "party",
  parentId = ""
): Promise<{ ok: true; party: Party } | { ok: false; error: string }> {
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length < 2) return { ok: false, error: "Give the party a name." };

  const token = requireToken();
  const db = await readDB(token);
  // A list that hangs off another needs to know what it hangs off, or nothing
  // can ever offer it.
  const needsParent = !!parentKindOf(kind);
  if (needsParent && !parentId) {
    return { ok: false, error: "Choose what this sits under." };
  }
  if (parentId && !db.parties.some((p) => p.id === parentId)) {
    return { ok: false, error: "That parent is no longer on the list." };
  }

  // Names collide only within their own list, and within a tree only under the
  // same parent: "Oval" under two different sub-categories is two real things.
  const existing = db.parties.find(
    (p) =>
      partyKindOf(p) === kind &&
      (p.parentId || "") === (parentId || "") &&
      partyKey(p.name) === partyKey(clean)
  );
  if (existing) {
    return { ok: false, error: `Already on the list as "${existing.name}".` };
  }

  const party: Party = {
    id: randomUUID(),
    name: clean,
    kind,
    ...(parentId ? { parentId } : {}),
    createdAt: new Date().toISOString(),
    createdBy: by,
  };
  db.parties.push(party);
  await writeDB(db, token);
  return { ok: true, party };
}

export async function renameParty(
  id: string,
  name: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length < 2) return { ok: false, error: "Give the party a name." };

  const token = requireToken();
  const db = await readDB(token);
  const i = db.parties.findIndex((p) => p.id === id);
  if (i === -1) return { ok: false, error: "Party not found." };
  if (db.parties.some((p) => p.id !== id && partyKey(p.name) === partyKey(clean))) {
    return { ok: false, error: "Another party already has that name." };
  }
  db.parties[i] = { ...db.parties[i], name: clean };
  await writeDB(db, token);
  return { ok: true };
}

export async function deleteParty(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = requireToken();
  const db = await readDB(token);
  const party = db.parties.find((p) => p.id === id);
  if (!party) return { ok: false, error: "Party not found." };

  // A party named on an existing memo stays on the list — removing it would
  // leave that memo pointing at something the list no longer knows about.
  // Only memo parties can be on a memo; a category never is.
  const used = partyKindOf(party) !== "party"
    ? 0
    : db.memos.filter((m) => partyKey(m.to) === partyKey(party.name)).length;
  if (used > 0) {
    return {
      ok: false,
      error: `${party.name} is on ${used} memo${used === 1 ? "" : "s"} and cannot be removed. Rename it instead.`,
    };
  }
  // Anything hanging off it goes too, however deep: a sub-sub-category whose
  // sub-category is gone can never be reached, and left behind it would
  // reappear the day something with the old id is added.
  const doomed = new Set([id]);
  for (let pass = 0; pass < 4; pass++) {
    for (const p of db.parties) {
      if (p.parentId && doomed.has(p.parentId)) doomed.add(p.id);
    }
  }
  db.parties = db.parties.filter((p) => !doomed.has(p.id));
  await writeDB(db, token);
  return { ok: true };
}

// Gate for saving a memo. Matching ignores case and punctuation, and the
// stored value is snapped to the list's spelling, so a memo can never record a
// variant of a name that is already on the list.
export async function resolveParty(
  name: string
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const token = requireToken();
  const db = await readDB(token);

  // An empty list means the feature has not been set up yet; refusing every
  // memo until an admin adds a party would stop the business dead.
  if (db.parties.length === 0) return { ok: true, name: name.trim() };

  const match = db.parties.find((p) => partyKey(p.name) === partyKey(name));
  if (!match) {
    return {
      ok: false,
      error: `"${name.trim()}" is not on the party list. Pick an existing party, or ask an admin to add it.`,
    };
  }
  return { ok: true, name: match.name };
}

// Distinct party names already written on memos that are not on the list —
// what the free-text era left behind, so an admin can see the variants and
// add the correct spelling of each.
export type UnlistedName = {
  name: string;
  memos: number;
  // The listed party this was probably meant to be, worked out from the name
  // itself. Null when nothing is close enough to put in front of someone.
  match: string;
  score: number;
};

export async function unlistedPartyNames(): Promise<UnlistedName[]> {
  const token = requireToken();
  const db = await readDB(token);
  const parties = db.parties.filter((p) => partyKindOf(p) === "party");
  const known = new Set(parties.map((p) => partyKey(p.name)));
  const listed = parties.map((p) => p.name);

  const counts = new Map<string, { name: string; memos: number }>();
  for (const m of db.memos) {
    const key = partyKey(m.to);
    if (!key || known.has(key)) continue;
    const prev = counts.get(key);
    counts.set(key, { name: prev?.name || m.to, memos: (prev?.memos || 0) + 1 });
  }

  return [...counts.values()]
    .map((u) => {
      const best = closestName(u.name, listed);
      return { ...u, match: best?.name || "", score: best?.score || 0 };
    })
    .sort((a, b) => b.score - a.score || b.memos - a.memos);
}

// Puts every memo carrying a typed name onto a name from the list. This is the
// only way an old memo's recipient changes: the memo form has not accepted a
// typed name since the list came in.
export async function replacePartyOnMemos(
  from: string,
  to: string
): Promise<{ ok: true; memos: number } | { ok: false; error: string }> {
  const fromKey = partyKey(from);
  if (!fromKey) return { ok: false, error: "Nothing to replace." };

  const token = requireToken();
  const db = await readDB(token);
  const target = db.parties.find(
    (p) => partyKindOf(p) === "party" && partyKey(p.name) === partyKey(to)
  );
  if (!target) return { ok: false, error: `${to} is not on the party list.` };

  const now = new Date().toISOString();
  let changed = 0;
  for (const m of db.memos) {
    if (partyKey(m.to) !== fromKey) continue;
    m.to = target.name; // the list's spelling, not the one typed that day
    // The memo's paper says something different now, so the nightly backup
    // fetches its PDF again rather than keeping the old one.
    m.updatedAt = now;
    changed++;
  }
  if (!changed) return { ok: false, error: `No memos are under "${from}".` };
  await writeDB(db, token);
  return { ok: true, memos: changed };
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export async function listOrders(): Promise<Order[]> {
  const token = requireToken();
  const db = await readDB(token);
  return db.orders
    .map((o) => ({ ...o, comments: o.comments || [] })) // orders saved before comments existed
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// Notes are only ever added. Editing an order does not touch them, so the
// history of what was said about a piece survives any later correction.
export async function addOrderComment(
  id: string,
  text: string,
  by: string
): Promise<Order | null> {
  const token = requireToken();
  const db = await readDB(token);
  const i = db.orders.findIndex((o) => o.id === id);
  if (i === -1) return null;

  const comments = db.orders[i].comments || [];
  comments.push({ id: randomUUID(), text, at: new Date().toISOString(), by });
  db.orders[i] = { ...db.orders[i], comments };
  await writeDB(db, token);
  return db.orders[i];
}

// `firstNote` lets an order be created with its opening comment in one write,
// so a note typed on the add form is saved atomically with the order itself
// rather than as a second call that could fail on its own.
export async function createOrder(
  input: NewOrder,
  firstNote?: { text: string; by: string }
): Promise<Order> {
  const token = requireToken();
  const db = await readDB(token);

  const fy = fyFromInput(todayInput());
  const key = `O:${fy}`;
  const seq = (db.counters[key] || 0) + 1;
  db.counters[key] = seq;

  const now = new Date().toISOString();
  const order: Order = {
    id: orderIdFor(fy, seq),
    orderNo: orderNoFor(fy, seq),
    fy,
    seq,
    customer: input.customer,
    productName: input.productName,
    goldColor: input.goldColor,
    diamondCts: input.diamondCts,
    pcs: input.pcs,
    stockNo: input.stockNo || undefined,
    status: input.status,
    comments: firstNote?.text
      ? [{ id: randomUUID(), text: firstNote.text, at: now, by: firstNote.by }]
      : [],
    createdAt: now,
    updatedAt: now,
  };
  db.orders.push(order);
  await writeDB(db, token);
  return order;
}

export async function updateOrder(
  id: string,
  patch: Partial<NewOrder>
): Promise<Order | null> {
  const token = requireToken();
  const db = await readDB(token);
  const i = db.orders.findIndex((o) => o.id === id);
  if (i === -1) return null;
  db.orders[i] = {
    ...db.orders[i],
    ...patch,
    stockNo: (patch.stockNo ?? db.orders[i].stockNo) || undefined,
    // An edit changes the order's details, never its notes.
    comments: db.orders[i].comments || [],
    updatedAt: new Date().toISOString(),
  };
  await writeDB(db, token);
  return db.orders[i];
}

export async function deleteOrder(id: string): Promise<boolean> {
  const token = requireToken();
  const db = await readDB(token);
  const before = db.orders.length;
  db.orders = db.orders.filter((o) => o.id !== id);
  if (db.orders.length === before) return false;
  await writeDB(db, token);
  return true;
}

export async function listEvents(): Promise<StockEvent[]> {
  const token = requireToken();
  return (await readDB(token)).events;
}

export async function getMemoWithEvents(
  id: string
): Promise<{ memo: Memo; events: StockEvent[] } | null> {
  const token = requireToken();
  const db = await readDB(token);
  const memo = db.memos.find((m) => m.id === id);
  if (!memo) return null;
  return { memo, events: db.events.filter((e) => e.memoId === id) };
}

export type NewStockEvent = {
  stockNo: string;
  outcome: StockOutcome;
  replacedBy?: string;
  note?: string;
  onDate?: string; // yyyy-mm-dd
};

// Append outcomes for one memo. Nothing is overwritten: recording the same
// stock number twice leaves both entries, and the later one becomes current.
export async function recordStockEvents(
  memoId: string,
  entries: NewStockEvent[],
  by: string
): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  const token = requireToken();
  const db = await readDB(token);
  const memo = db.memos.find((m) => m.id === memoId);
  if (!memo) return { ok: false, error: "Memo not found." };

  const onMemo = new Set(memo.items.flatMap((it) => it.stockNos));
  const at = new Date().toISOString();

  for (const e of entries) {
    if (!onMemo.has(e.stockNo)) {
      return { ok: false, error: `${e.stockNo} is not on memo ${memo.memoNo}.` };
    }
    if (e.outcome === "exchanged" && !e.replacedBy) {
      return { ok: false, error: `Give the replacement stock number for ${e.stockNo}.` };
    }
    db.events.push({
      id: randomUUID(),
      memoId,
      memoNo: memo.memoNo,
      stockNo: e.stockNo,
      outcome: e.outcome,
      replacedBy: e.replacedBy || undefined,
      note: e.note || undefined,
      onDate: e.onDate || at.slice(0, 10),
      at,
      by,
    });
  }

  await writeDB(db, token);
  return { ok: true, added: entries.length };
}

export type LedgerEntry = {
  memoId: string;
  memoNo: string;
  kind: MemoKind;
  to: string;
  date: string;
  type: string;
  outcome: StockOutcome | null;
  event?: StockEvent;
};

// Everywhere a stock number has been: every memo it went out on, newest first,
// with what became of it each time.
export async function stockHistory(stockNo: string): Promise<LedgerEntry[]> {
  const token = requireToken();
  const db = await readDB(token);
  const wanted = stockNo.trim().toUpperCase();
  const out: LedgerEntry[] = [];

  for (const m of db.memos) {
    const line = linesFor(m.id, m.items, db.events).find((l) => l.stockNo === wanted);
    if (!line) continue;
    out.push({
      memoId: m.id,
      memoNo: m.memoNo,
      kind: m.kind,
      to: m.to,
      date: m.date,
      type: line.type,
      outcome: line.outcome,
      event: line.event,
    });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

// Every stock number the business has ever put on a memo, with where it is now.
export async function stockIndex(): Promise<
  { stockNo: string; type: string; memos: number; current: StockOutcome | null; lastMemoNo: string; lastDate: string }[]
> {
  const token = requireToken();
  const db = await readDB(token);
  const byStock = new Map<string, { type: string; memos: number; current: StockOutcome | null; lastMemoNo: string; lastDate: string }>();

  const chronological = [...db.memos].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const m of chronological) {
    for (const line of linesFor(m.id, m.items, db.events)) {
      const prev = byStock.get(line.stockNo);
      byStock.set(line.stockNo, {
        type: line.type || prev?.type || "",
        memos: (prev?.memos || 0) + 1,
        current: line.outcome, // latest memo wins, so this is where it stands now
        lastMemoNo: m.memoNo,
        lastDate: m.date,
      });
    }
  }
  return [...byStock.entries()]
    .map(([stockNo, v]) => ({ stockNo, ...v }))
    .sort((a, b) => (a.lastDate < b.lastDate ? 1 : -1));
}

// Update an existing memo's details. The identity fields (id, memoNo, seq, fy,
// createdAt) are preserved — a memo keeps its number even if the date changes.
export async function updateMemo(id: string, patch: NewMemo): Promise<Memo | null> {
  const token = requireToken();
  const db = await readDB(token);
  const idx = db.memos.findIndex((m) => m.id === id);
  if (idx === -1) return null;
  const existing = db.memos[idx];
  // A memo never changes kind — it keeps the number it was issued under, and
  // that number says which book it belongs to.
  const items = existing.kind === "gold" ? [] : patch.items || [];
  const goldItems = existing.kind === "gold" ? patch.goldItems || [] : [];
  const updated: Memo = {
    ...existing,
    to: patch.to,
    through: patch.through,
    mobile: patch.mobile,
    date: patch.date || existing.date,
    purpose: patch.purpose,
    comment: patch.comment,
    items,
    goldItems,
    againstMemoNo: patch.againstMemoNo || undefined,
    totalPcs: totalOf(items),
    totalGrossWt: sumBy(goldItems, (r) => r.grossWt),
    totalFineWt: sumBy(goldItems, (r) => r.fineWt),
    updatedAt: new Date().toISOString(),
    // Content changed — drop the stale Drive link so the memo re-uploads fresh.
    driveLink: undefined,
  };
  db.memos[idx] = updated;
  await writeDB(db, token);
  return updated;
}

// Record the Drive link after a successful upload.
export async function setDriveLink(id: string, link: string): Promise<void> {
  const token = requireToken();
  const db = await readDB(token);
  const memo = db.memos.find((m) => m.id === id);
  if (!memo) return;
  memo.driveLink = link;
  await writeDB(db, token);
}

export async function deleteMemo(id: string): Promise<boolean> {
  const token = requireToken();
  const db = await readDB(token);
  const before = db.memos.length;
  db.memos = db.memos.filter((m) => m.id !== id);
  if (db.memos.length === before) return false;
  await writeDB(db, token);
  return true;
}

// Full database (counters + memos) for backup. Counters are included so a
// restore preserves the serial-number sequence.
export async function exportDb(): Promise<DB> {
  const token = requireToken();
  return readDB(token);
}

// Overwrite the entire database from a previously exported backup.
export async function importDb(db: DB): Promise<void> {
  const token = requireToken();
  const safe: DB = {
    counters: db && typeof db.counters === "object" && db.counters ? db.counters : {},
    memos: Array.isArray(db?.memos) ? db.memos : [],
    // Restoring must bring the movement history back too, or a restore would
    // quietly reset every piece to "still out" and lose the audit trail.
    events: Array.isArray(db?.events) ? db.events : [],
    // Same reasoning as events: a restore that dropped this would erase the
    // whole order book.
    orders: Array.isArray(db?.orders) ? db.orders : [],
    parties: Array.isArray(db?.parties) ? db.parties : [],
  };
  await writeDB(safe, token);
}

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
  todayInput,
  type MemoKind,
  type OrderStatus,
  type StockEvent,
  type StockOutcome,
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
  createdAt: string;
  updatedAt?: string;
};

export type NewOrder = Omit<Order, "id" | "orderNo" | "fy" | "seq" | "createdAt">;

export type DB = {
  counters: Record<string, number>;
  memos: Memo[];
  events: StockEvent[];
  orders: Order[];
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
      return { counters: {}, memos: [], events: [], orders: [] };
    }
    const db = (await new Response(result.stream).json()) as Partial<DB>;
    return {
      counters: db.counters || {},
      memos: (db.memos || []).map(normalize),
      events: db.events || [],
      orders: db.orders || [],
    };
  } catch (err) {
    // First run: the DB blob doesn't exist yet.
    if (err instanceof BlobNotFoundError) return { counters: {}, memos: [], events: [], orders: [] };
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
// Orders
// ---------------------------------------------------------------------------

export async function listOrders(): Promise<Order[]> {
  const token = requireToken();
  const db = await readDB(token);
  return db.orders.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function createOrder(input: NewOrder): Promise<Order> {
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
  };
  await writeDB(safe, token);
}

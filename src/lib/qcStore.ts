// QC records, in their own JSON document like every other module.
import "server-only";
import { isDbConfigured, readDoc, writeDoc } from "./db";
import { listStockEntries } from "./stockBookStore";
import { listPartyNames } from "./memoStore";
import { priceOf, type StockEntry } from "./stockBookConfig";
import { loadPrices } from "./priceStore";
import { stockKey, todayInput } from "./memoFormat";
import {
  failedChecks, qcResult,
  type NewQcRecord, type QcAnswer, type QcLine, type QcRecord, type QcResult,
} from "./qcConfig";

const DB_PATH = "qc/db.json";

export type QcDB = { records: QcRecord[]; seq: number };

export function isQcStorageConfigured(): boolean {
  return isDbConfigured();
}

async function readDB(): Promise<QcDB> {
  const db = await readDoc<Partial<QcDB>>(DB_PATH, {});
  return { records: db.records || [], seq: db.seq || 0 };
}

async function writeDB(db: QcDB): Promise<void> {
  await writeDoc(DB_PATH, db);
}

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const answer = (v: unknown): QcAnswer =>
  v === "yes" || v === "no" || v === "na" ? v : "";

export function normalizeQcInput(body: Record<string, unknown>): NewQcRecord {
  const raw = Array.isArray(body.lines) ? body.lines : [];
  const lines: QcLine[] = raw
    .map((r) => {
      const l = r as Partial<QcLine>;
      return { check: s(l.check), answer: answer(l.answer), remark: s(l.remark) };
    })
    .filter((l) => l.check);

  return {
    stockNo: s(body.stockNo),
    date: s(body.date) || todayInput(),
    checkedBy: s(body.checkedBy),
    designNo: s(body.designNo),
    design: s(body.design),
    category: s(body.category),
    goldDetails: s(body.goldDetails),
    location: s(body.location),
    inchSize: s(body.inchSize),
    grossWt: s(body.grossWt),
    netWt: s(body.netWt),
    totalDiaWt: s(body.totalDiaWt),
    totalDiaPcs: s(body.totalDiaPcs),
    manufacturer: s(body.manufacturer),
    lines,
    comments: s(body.comments),
    stockId: s(body.stockId) || undefined,
  };
}

export async function listQcRecords(): Promise<QcRecord[]> {
  const db = await readDB();
  return db.records.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// --- The list screen's own shape ---------------------------------------------

// One row of the QC list, and nothing else.
//
// The list used to be handed whole QcRecords. A QC record is the heaviest thing
// the portal stores, because of its `lines`: a category is looked over for
// fifteen or so things, each line carrying the check as the list spells it
// ("Gold Color Check with Master Piece"), an answer and a remark. That is about
// two thirds of every record, and the list is a client component, so React
// wrote all of it into the page the server sent. Half the top level fields were
// never read at all. Measured on a few hundred records that is tens of
// milliseconds and most of a megabyte, and a request on the free Worker plan is
// allowed ten, so the screen stopped rendering.
//
// What the screen needs from the lines is the verdict and the names of whatever
// failed, so both are worked out here, once per record, and the lines stay in
// storage. The detail table under a row is collapsed until somebody opens it,
// and that is when the lines for that one record are fetched.
export type QcRow = {
  id: string;
  // Shown in the table.
  qcNo: string;
  stockNo: string;
  designNo: string;
  category: string;
  date: string;
  checkedBy: string;
  // Searched, but not shown.
  design: string;
  // Searched, and shown under a row that has been opened.
  comments: string;
  // The verdict, and the checks it failed on by name. The table shows both and
  // the tabs count by verdict, so working it out on the client meant building
  // every record's line list in the browser twice over.
  result: QcResult;
  failed: string[];
  // How many checks the record holds, for the heading on the detail table. The
  // lines themselves are not sent, but the count is one number.
  lineCount: number;
};

function toRow(r: QcRecord): QcRow {
  return {
    id: r.id,
    qcNo: r.qcNo,
    stockNo: r.stockNo,
    designNo: r.designNo,
    category: r.category,
    date: r.date,
    checkedBy: r.checkedBy,
    design: r.design,
    comments: r.comments,
    result: qcResult(r.lines),
    failed: failedChecks(r.lines).map((l) => l.check),
    lineCount: r.lines.length,
  };
}

export async function listQcRows(): Promise<QcRow[]> {
  const db = await readDB();
  return db.records
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(toRow);
}

// Every check against each of these stock numbers, oldest first, so it reads
// in the order the checking happened.
//
// One read of the document, which is the only store QC has: the records have
// not been copied into the database yet, and this has to keep working until
// they are. The lines themselves stay in storage — what the report shows is the
// verdict and whatever failed by name, which is what a row carries.
export async function qcRowsForStockNos(keys: string[]): Promise<QcRow[]> {
  if (keys.length === 0) return [];
  const wanted = new Set(keys);
  const db = await readDB();
  return db.records
    .filter((r) => wanted.has(stockKey(r.stockNo)))
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    .map(toRow);
}

// The checks of one record, for a row somebody has just opened.
export async function qcLinesOf(id: string): Promise<QcLine[] | null> {
  const db = await readDB();
  const rec = db.records.find((r) => r.id === id);
  return rec ? rec.lines : null;
}

export async function getQcRecord(id: string): Promise<QcRecord | null> {
  const db = await readDB();
  return db.records.find((r) => r.id === id) || null;
}

export const qcNoFor = (seq: number) => `QC-${String(seq).padStart(5, "0")}`;

export async function createQcRecord(input: NewQcRecord): Promise<QcRecord> {
  const db = await readDB();
  db.seq += 1;
  const now = new Date().toISOString();
  const rec: QcRecord = {
    ...input,
    id: `QCR-${String(db.seq).padStart(5, "0")}`,
    qcNo: qcNoFor(db.seq),
    createdAt: now,
    updatedAt: now,
  };
  db.records.push(rec);
  await writeDB(db);
  return rec;
}

export async function updateQcRecord(
  id: string,
  patch: NewQcRecord
): Promise<QcRecord | null> {
  const db = await readDB();
  const idx = db.records.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  db.records[idx] = {
    ...db.records[idx],
    ...patch,
    stockId: patch.stockId ?? db.records[idx].stockId,
    updatedAt: new Date().toISOString(),
  };
  await writeDB(db);
  return db.records[idx];
}

export async function deleteQcRecord(id: string): Promise<boolean> {
  const db = await readDB();
  const before = db.records.length;
  db.records = db.records.filter((r) => r.id !== id);
  if (db.records.length === before) return false;
  await writeDB(db);
  return true;
}

export async function exportQcDb(): Promise<QcDB> {
  return readDB();
}

// --- Starting a QC from a stock number ---------------------------------------

export type QcSeed = {
  stockId: string;
  stockNo: string;
  designNo: string;
  design: string;
  category: string;
  goldDetails: string;
  location: string;
  inchSize: string;
  grossWt: string;
  netWt: string;
  totalDiaWt: string;
  totalDiaPcs: string;
  manufacturer: string;
  checks: string[]; // the checks that category is looked over for
  done: number; // how many times this piece has been through QC already
};

function seedOf(e: StockEntry, totals: { wt: number; pcs: number }): Omit<QcSeed, "checks" | "done"> {
  return {
    stockId: e.id,
    stockNo: e.stockNo,
    designNo: e.designNo,
    design: e.design,
    category: e.category,
    goldDetails: e.goldDetails,
    location: e.location,
    inchSize: e.inchSize,
    grossWt: e.grossWt,
    netWt: e.netWt,
    totalDiaWt: totals.wt ? String(parseFloat(totals.wt.toFixed(3))) : "",
    totalDiaPcs: totals.pcs ? String(totals.pcs) : "",
    manufacturer: e.mfgName || e.partyName,
  };
}

// Every piece in stock, with the checks its category calls for. Only stock the
// portal knows about can be checked — a QC record against a piece that was
// never taken in would have nothing to be about.
export async function piecesForQc(): Promise<QcSeed[]> {
  const [entries, prices, lists, records] = await Promise.all([
    listStockEntries(),
    loadPrices(),
    listPartyNames(["qcCheck"]).catch(() => ({ qcCheck: [] })),
    listQcRecords().catch(() => [] as QcRecord[]),
  ]);

  const checksFor = (category: string) =>
    (lists.qcCheck || [])
      .filter((c) => c.parent === category)
      .map((c) => c.name);

  const doneCount = new Map<string, number>();
  for (const r of records) {
    doneCount.set(r.stockNo, (doneCount.get(r.stockNo) || 0) + 1);
  }

  return entries.map((e) => {
    const p = priceOf(prices, e);
    return {
      ...seedOf(e, { wt: p.totalWeight, pcs: p.totalPcs }),
      checks: checksFor(e.category),
      done: doneCount.get(e.stockNo) || 0,
    };
  });
}

// One piece, ready to be checked.
//
// The piece is found in the book first and only that one is priced. Working
// through piecesForQc instead meant pricing every entry in the stock book —
// diamond lines, gold rate, labour, the lot — to answer about one stock
// number, and the number was looked up twice for every QC saved.
export async function qcSeedForStock(stockNo: string): Promise<QcSeed | null> {
  const wanted = stockNo.trim().toLowerCase();
  if (!wanted) return null;

  const entries = await listStockEntries();
  const entry = entries.find((e) => e.stockNo.toLowerCase() === wanted);
  if (!entry) return null;

  const [prices, lists, records] = await Promise.all([
    loadPrices(),
    listPartyNames(["qcCheck"]).catch(() => ({ qcCheck: [] })),
    listQcRecords().catch(() => [] as QcRecord[]),
  ]);

  const p = priceOf(prices, entry);
  return {
    ...seedOf(entry, { wt: p.totalWeight, pcs: p.totalPcs }),
    checks: (lists.qcCheck || [])
      .filter((c) => c.parent === entry.category)
      .map((c) => c.name),
    done: records.filter((r) => r.stockNo === entry.stockNo).length,
  };
}

// Is this stock number in the book? The save only needs to know the piece
// exists, so it does not pay for the piece's prices and checks as well.
export async function stockNoInBook(stockNo: string): Promise<boolean> {
  const wanted = stockNo.trim().toLowerCase();
  if (!wanted) return false;
  const entries = await listStockEntries();
  return entries.some((e) => e.stockNo.toLowerCase() === wanted);
}

// Every check any category uses, for an export that has to be one table.
export async function allQcChecks(): Promise<string[]> {
  const lists = await listPartyNames(["qcCheck"]).catch(() => ({ qcCheck: [] }));
  const seen: string[] = [];
  for (const c of lists.qcCheck || []) {
    if (!seen.includes(c.name)) seen.push(c.name);
  }
  return seen;
}

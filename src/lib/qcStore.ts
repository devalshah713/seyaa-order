// QC records, in their own JSON document like every other module.
import "server-only";
import { get, put, BlobNotFoundError } from "@vercel/blob";
import { listStockEntries } from "./stockBookStore";
import { listPartyNames } from "./memoStore";
import { priceOf, type StockEntry } from "./stockBookConfig";
import { loadPrices } from "./priceStore";
import { todayInput } from "./memoFormat";
import type { NewQcRecord, QcAnswer, QcLine, QcRecord } from "./qcConfig";

const DB_PATH = "qc/db.json";

export type QcDB = { records: QcRecord[]; seq: number };

export function isQcStorageConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

function requireToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error(
      "Storage is not configured. Add the BLOB_READ_WRITE_TOKEN environment variable in Vercel and redeploy."
    );
  }
  return token;
}

async function readDB(token: string): Promise<QcDB> {
  try {
    const result = await get(DB_PATH, { access: "private", token, useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return { records: [], seq: 0 };
    const db = (await new Response(result.stream).json()) as Partial<QcDB>;
    return { records: db.records || [], seq: db.seq || 0 };
  } catch (err) {
    if (err instanceof BlobNotFoundError) return { records: [], seq: 0 };
    throw err;
  }
}

async function writeDB(db: QcDB, token: string): Promise<void> {
  await put(DB_PATH, JSON.stringify(db), {
    access: "private",
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
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
  const token = requireToken();
  const db = await readDB(token);
  return db.records.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getQcRecord(id: string): Promise<QcRecord | null> {
  const token = requireToken();
  const db = await readDB(token);
  return db.records.find((r) => r.id === id) || null;
}

export const qcNoFor = (seq: number) => `QC-${String(seq).padStart(5, "0")}`;

export async function createQcRecord(input: NewQcRecord): Promise<QcRecord> {
  const token = requireToken();
  const db = await readDB(token);
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
  await writeDB(db, token);
  return rec;
}

export async function updateQcRecord(
  id: string,
  patch: NewQcRecord
): Promise<QcRecord | null> {
  const token = requireToken();
  const db = await readDB(token);
  const idx = db.records.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  db.records[idx] = {
    ...db.records[idx],
    ...patch,
    stockId: patch.stockId ?? db.records[idx].stockId,
    updatedAt: new Date().toISOString(),
  };
  await writeDB(db, token);
  return db.records[idx];
}

export async function deleteQcRecord(id: string): Promise<boolean> {
  const token = requireToken();
  const db = await readDB(token);
  const before = db.records.length;
  db.records = db.records.filter((r) => r.id !== id);
  if (db.records.length === before) return false;
  await writeDB(db, token);
  return true;
}

export async function exportQcDb(): Promise<QcDB> {
  return readDB(requireToken());
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

export async function qcSeedForStock(stockNo: string): Promise<QcSeed | null> {
  const wanted = stockNo.trim().toLowerCase();
  if (!wanted) return null;
  const all = await piecesForQc();
  return all.find((p) => p.stockNo.toLowerCase() === wanted) || null;
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

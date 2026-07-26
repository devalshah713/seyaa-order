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
import { fyFromInput, memoIdFor, memoNoFor, todayInput } from "./memoFormat";

const DB_PATH = "memos/db.json";

export type MemoItem = { type: string; stockNos: string[] };

export type Memo = {
  id: string; // URL-safe, e.g. "SS-26-27-001"
  memoNo: string; // printed, e.g. "SS/26-27/001"
  fy: string;
  seq: number;
  to: string;
  through: string;
  mobile: string;
  date: string; // yyyy-mm-dd
  purpose: string;
  comment: string;
  items: MemoItem[];
  totalPcs: number;
  createdAt: string; // ISO
};

export type NewMemo = Omit<Memo, "id" | "memoNo" | "fy" | "seq" | "totalPcs" | "createdAt">;

type DB = { counters: Record<string, number>; memos: Memo[] };

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
      return { counters: {}, memos: [] };
    }
    const db = (await new Response(result.stream).json()) as Partial<DB>;
    return { counters: db.counters || {}, memos: db.memos || [] };
  } catch (err) {
    // First run: the DB blob doesn't exist yet.
    if (err instanceof BlobNotFoundError) return { counters: {}, memos: [] };
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

export async function createMemo(input: NewMemo): Promise<Memo> {
  const token = requireToken();
  const db = await readDB(token);

  const date = input.date || todayInput();
  const fy = fyFromInput(date);
  const seq = (db.counters[fy] || 0) + 1;
  db.counters[fy] = seq;

  const memo: Memo = {
    id: memoIdFor(fy, seq),
    memoNo: memoNoFor(fy, seq),
    fy,
    seq,
    to: input.to,
    through: input.through,
    mobile: input.mobile,
    date,
    purpose: input.purpose,
    comment: input.comment,
    items: input.items,
    totalPcs: totalOf(input.items),
    createdAt: new Date().toISOString(),
  };
  db.memos.push(memo);
  await writeDB(db, token);
  return memo;
}

// Next serial for a given date's fiscal year — for the live form preview only.
export async function peekNextMemoNo(dateInput: string): Promise<string> {
  const token = requireToken();
  const db = await readDB(token);
  const fy = fyFromInput(dateInput || todayInput());
  return memoNoFor(fy, (db.counters[fy] || 0) + 1);
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

// Update an existing memo's details. The identity fields (id, memoNo, seq, fy,
// createdAt) are preserved — a memo keeps its number even if the date changes.
export async function updateMemo(id: string, patch: NewMemo): Promise<Memo | null> {
  const token = requireToken();
  const db = await readDB(token);
  const idx = db.memos.findIndex((m) => m.id === id);
  if (idx === -1) return null;
  const existing = db.memos[idx];
  const updated: Memo = {
    ...existing,
    to: patch.to,
    through: patch.through,
    mobile: patch.mobile,
    date: patch.date || existing.date,
    purpose: patch.purpose,
    comment: patch.comment,
    items: patch.items,
    totalPcs: totalOf(patch.items),
  };
  db.memos[idx] = updated;
  await writeDB(db, token);
  return updated;
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

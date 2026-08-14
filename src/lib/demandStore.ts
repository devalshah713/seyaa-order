// Diamond demand store — same private Vercel Blob pattern as memoStore and
// pdStore, in its own JSON document.
import "server-only";
import { get, put, BlobNotFoundError } from "@vercel/blob";
import { fyFromInput, pad, todayInput } from "./memoFormat";
import type { DemandRow } from "./demandConfig";

const DB_PATH = "demand/db.json";

export type Demand = {
  id: string; // e.g. "DD-26-27-001"
  demandNo: string; // e.g. "DD/26-27/001"
  fy: string;
  seq: number;

  date: string; // yyyy-mm-dd
  issuedTo: string; // diamond department / supplier
  notes: string;
  rows: DemandRow[];

  // Which PD sheet this was raised from, so the two can be traced together.
  pdId?: string;
  pdNo?: string;

  createdAt: string;
  updatedAt: string;
};

export type NewDemand = Omit<Demand, "id" | "demandNo" | "fy" | "seq" | "createdAt" | "updatedAt">;
export type DemandDB = { counters: Record<string, number>; demands: Demand[] };

export function isDemandStorageConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

export function normalizeDemandInput(body: Record<string, unknown>): NewDemand {
  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const rawRows = Array.isArray(body.rows) ? body.rows : [];
  const rows: DemandRow[] = rawRows
    .map((raw) => {
      const r = raw as Partial<DemandRow>;
      return {
        designNo: str(r.designNo), shape: str(r.shape), pointers: str(r.pointers),
        pcs: str(r.pcs), comments: str(r.comments), bags: str(r.bags),
        growth: str(r.growth),
      };
    })
    .filter((r) => r.designNo || r.shape || r.pointers || r.pcs || r.bags);

  return {
    date: s("date"),
    issuedTo: s("issuedTo"),
    notes: s("notes"),
    rows,
    pdId: s("pdId") || undefined,
    pdNo: s("pdNo") || undefined,
  };
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

async function readDB(token: string): Promise<DemandDB> {
  try {
    const result = await get(DB_PATH, { access: "private", token, useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return { counters: {}, demands: [] };
    }
    const db = (await new Response(result.stream).json()) as Partial<DemandDB>;
    return { counters: db.counters || {}, demands: db.demands || [] };
  } catch (err) {
    if (err instanceof BlobNotFoundError) return { counters: {}, demands: [] };
    throw err;
  }
}

async function writeDB(db: DemandDB, token: string): Promise<void> {
  await put(DB_PATH, JSON.stringify(db), {
    access: "private",
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function createDemand(input: NewDemand): Promise<Demand> {
  const token = requireToken();
  const db = await readDB(token);

  const date = input.date || todayInput();
  const fy = fyFromInput(date);
  const seq = (db.counters[fy] || 0) + 1;
  db.counters[fy] = seq;

  const now = new Date().toISOString();
  const demand: Demand = {
    ...input,
    date,
    id: `DD-${fy}-${pad(seq)}`,
    demandNo: `DD/${fy}/${pad(seq)}`,
    fy,
    seq,
    createdAt: now,
    updatedAt: now,
  };
  db.demands.push(demand);
  await writeDB(db, token);
  return demand;
}

export async function listDemands(): Promise<Demand[]> {
  const token = requireToken();
  const db = await readDB(token);
  return db.demands.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getDemand(id: string): Promise<Demand | null> {
  const token = requireToken();
  const db = await readDB(token);
  return db.demands.find((d) => d.id === id) || null;
}

export async function updateDemand(id: string, patch: NewDemand): Promise<Demand | null> {
  const token = requireToken();
  const db = await readDB(token);
  const idx = db.demands.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  const updated: Demand = {
    ...db.demands[idx],
    ...patch,
    date: patch.date || db.demands[idx].date,
    updatedAt: new Date().toISOString(),
  };
  db.demands[idx] = updated;
  await writeDB(db, token);
  return updated;
}

export async function deleteDemand(id: string): Promise<boolean> {
  const token = requireToken();
  const db = await readDB(token);
  const before = db.demands.length;
  db.demands = db.demands.filter((d) => d.id !== id);
  if (db.demands.length === before) return false;
  await writeDB(db, token);
  return true;
}

export async function nextDemandNo(dateInput: string): Promise<string> {
  const token = requireToken();
  const db = await readDB(token);
  const fy = fyFromInput(dateInput || todayInput());
  return `DD/${fy}/${pad((db.counters[fy] || 0) + 1)}`;
}

// For the nightly backup.
export async function exportDemandDb(): Promise<DemandDB> {
  const token = requireToken();
  return readDB(token);
}

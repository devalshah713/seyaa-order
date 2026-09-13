// Diamond demand store — same shared-storage pattern as memoStore and
// pdStore, in its own JSON document.
import "server-only";
import { isDbConfigured, readDoc, writeDoc } from "./db";
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
  return isDbConfigured();
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

async function readDB(): Promise<DemandDB> {
  const db = await readDoc<Partial<DemandDB>>(DB_PATH, {});
  return { counters: db.counters || {}, demands: db.demands || [] };
}

async function writeDB(db: DemandDB): Promise<void> {
  await writeDoc(DB_PATH, db);
}

export async function createDemand(input: NewDemand): Promise<Demand> {
  const db = await readDB();

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
  await writeDB(db);
  return demand;
}

export async function listDemands(): Promise<Demand[]> {
  const db = await readDB();
  return db.demands.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getDemand(id: string): Promise<Demand | null> {
  const db = await readDB();
  return db.demands.find((d) => d.id === id) || null;
}

export async function updateDemand(id: string, patch: NewDemand): Promise<Demand | null> {
  const db = await readDB();
  const idx = db.demands.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  const updated: Demand = {
    ...db.demands[idx],
    ...patch,
    date: patch.date || db.demands[idx].date,
    updatedAt: new Date().toISOString(),
  };
  db.demands[idx] = updated;
  await writeDB(db);
  return updated;
}

export async function deleteDemand(id: string): Promise<boolean> {
  const db = await readDB();
  const before = db.demands.length;
  db.demands = db.demands.filter((d) => d.id !== id);
  if (db.demands.length === before) return false;
  await writeDB(db);
  return true;
}

export async function nextDemandNo(dateInput: string): Promise<string> {
  const db = await readDB();
  const fy = fyFromInput(dateInput || todayInput());
  return `DD/${fy}/${pad((db.counters[fy] || 0) + 1)}`;
}

// For the nightly backup.
export async function exportDemandDb(): Promise<DemandDB> {
  return readDB();
}

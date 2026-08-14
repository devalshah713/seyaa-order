// Product Development (PD) sheet store — same private Vercel Blob pattern as
// memoStore, in its own JSON document so the two modules stay independent.
import "server-only";
import { get, put, BlobNotFoundError } from "@vercel/blob";
import { fyFromInput, pad, todayInput } from "./memoFormat";

const DB_PATH = "pd/db.json";

export type PdSheet = {
  id: string; // e.g. "PD-26-27-001"
  pdNo: string; // e.g. "PD/26-27/001"
  fy: string;
  seq: number;

  photoPath: string; // private blob pathname, served via /api/photo
  sku: string; // final SKU (auto-built, but editable)

  // Left column
  product: string;
  category: string;
  subCategory: string;
  type: string;
  diaQuality: string;
  goldWeight: string;
  locks: string;
  orderType: string;
  assignedDate: string; // yyyy-mm-dd

  // Right column
  assignedTo: string;
  size: string; // Neck Length / Ring Size …
  diaShape: string;
  zone: string;
  goldPurity: string;
  goldColor: string;
  priceRange: string;
  diaWeightPointers: string;
  quantity: string;
  orderBy: string;
  deliveryDate: string; // yyyy-mm-dd

  pdMerchandiser: string;
  remarks: string;

  // SKU segments that aren't derivable from the fields above
  line: string; // e.g. "SL"
  caratCode: string; // e.g. "20CT"
  pointerRange: string; // e.g. "011-015"

  createdAt: string;
  updatedAt: string;
};

export type NewPdSheet = Omit<PdSheet, "id" | "pdNo" | "fy" | "seq" | "createdAt" | "updatedAt">;

export type PdDB = { counters: Record<string, number>; sheets: PdSheet[] };

export function isPdStorageConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

// Every PD field is free text by design (the form's combos accept new values),
// so normalising an incoming request body is just trimming the strings.
export function normalizePdInput(body: Record<string, unknown>): NewPdSheet {
  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  return {
    photoPath: s("photoPath"), sku: s("sku"),
    product: s("product"), category: s("category"), subCategory: s("subCategory"),
    type: s("type"), diaQuality: s("diaQuality"), goldWeight: s("goldWeight"),
    locks: s("locks"), orderType: s("orderType"), assignedDate: s("assignedDate"),
    assignedTo: s("assignedTo"), size: s("size"), diaShape: s("diaShape"), zone: s("zone"),
    goldPurity: s("goldPurity"), goldColor: s("goldColor"), priceRange: s("priceRange"),
    diaWeightPointers: s("diaWeightPointers"), quantity: s("quantity"),
    orderBy: s("orderBy"), deliveryDate: s("deliveryDate"),
    pdMerchandiser: s("pdMerchandiser"), remarks: s("remarks"),
    line: s("line"), caratCode: s("caratCode"), pointerRange: s("pointerRange"),
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

async function readDB(token: string): Promise<PdDB> {
  try {
    const result = await get(DB_PATH, { access: "private", token, useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return { counters: {}, sheets: [] };
    }
    const db = (await new Response(result.stream).json()) as Partial<PdDB>;
    return { counters: db.counters || {}, sheets: db.sheets || [] };
  } catch (err) {
    if (err instanceof BlobNotFoundError) return { counters: {}, sheets: [] };
    throw err;
  }
}

async function writeDB(db: PdDB, token: string): Promise<void> {
  await put(DB_PATH, JSON.stringify(db), {
    access: "private",
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function createPdSheet(input: NewPdSheet): Promise<PdSheet> {
  const token = requireToken();
  const db = await readDB(token);

  const date = input.assignedDate || todayInput();
  const fy = fyFromInput(date);
  const seq = (db.counters[fy] || 0) + 1;
  db.counters[fy] = seq;

  const now = new Date().toISOString();
  const sheet: PdSheet = {
    ...input,
    id: `PD-${fy}-${pad(seq)}`,
    pdNo: `PD/${fy}/${pad(seq)}`,
    fy,
    seq,
    createdAt: now,
    updatedAt: now,
  };
  db.sheets.push(sheet);
  await writeDB(db, token);
  return sheet;
}

export async function listPdSheets(): Promise<PdSheet[]> {
  const token = requireToken();
  const db = await readDB(token);
  return db.sheets.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getPdSheet(id: string): Promise<PdSheet | null> {
  const token = requireToken();
  const db = await readDB(token);
  return db.sheets.find((s) => s.id === id) || null;
}

// Identity fields (id, pdNo, fy, seq, createdAt) are preserved on edit.
export async function updatePdSheet(id: string, patch: NewPdSheet): Promise<PdSheet | null> {
  const token = requireToken();
  const db = await readDB(token);
  const idx = db.sheets.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const updated: PdSheet = {
    ...db.sheets[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  db.sheets[idx] = updated;
  await writeDB(db, token);
  return updated;
}

export async function deletePdSheet(id: string): Promise<boolean> {
  const token = requireToken();
  const db = await readDB(token);
  const before = db.sheets.length;
  db.sheets = db.sheets.filter((s) => s.id !== id);
  if (db.sheets.length === before) return false;
  await writeDB(db, token);
  return true;
}

export async function nextPdNo(dateInput: string): Promise<string> {
  const token = requireToken();
  const db = await readDB(token);
  const fy = fyFromInput(dateInput || todayInput());
  return `PD/${fy}/${pad((db.counters[fy] || 0) + 1)}`;
}

// For the nightly backup.
export async function exportPdDb(): Promise<PdDB> {
  const token = requireToken();
  return readDB(token);
}

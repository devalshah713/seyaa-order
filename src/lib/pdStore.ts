// Product Development (PD) sheet store — same private Vercel Blob pattern as
// memoStore, in its own JSON document so the two modules stay independent.
import "server-only";
import { get, put, BlobNotFoundError } from "@vercel/blob";
import { fyFromInput, pad, todayInput } from "./memoFormat";
import type { DiaLine } from "./pdConfig";
import {
  isPieceStatus, matchDesign, reconcilePieces,
  type DesignHit, type PdPiece,
} from "./designNo";

const DB_PATH = "pd/db.json";

export type PdSheet = {
  id: string; // e.g. "PD-26-27-001"
  pdNo: string; // e.g. "PD/26-27/001"
  fy: string;
  seq: number;

  photoPath: string; // private blob pathname, served via /api/photo
  sku: string; // design number, entered by the team

  // Left column
  // `product` is the category — the top of the chain — kept under its old name
  // so the jangad's Product column and everything else reading it still work.
  product: string;
  category: string;
  subCategory: string;
  subSubCategory: string;
  type: string;
  // Total diamond weight, which the design number is built from — the "5CT" in
  // SN-BR-TN-5CT.
  tdw: string;
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

  // Structured diamond sizes behind the printed "Dia. Weight & Pointers" line,
  // kept so the picker can be reopened on edit.
  diaLines?: DiaLine[];

  // One entry per piece the design number covers — "…-45-49" is five pieces.
  // Always derived from `sku` (see reconcilePieces), never taken from a request
  // body, so the number and the pieces cannot drift apart.
  pieces?: PdPiece[];

  // Legacy SKU segments from when the design number was auto-built. Kept
  // optional so sheets saved before that change still load.
  line?: string;
  caratCode?: string;
  pointerRange?: string;

  // Who made the sheet and who last touched it. Optional because sheets
  // written before this was recorded have nobody's name on them, and inventing
  // one would be worse than leaving it blank.
  createdBy?: string;
  updatedBy?: string;

  createdAt: string;
  updatedAt: string;
};

// `pieces` is left out on purpose: it is worked out from the design number, so
// saving a sheet never carries a piece list in from the browser.
// Authorship is taken from the signed-in session on the server, never from the
// request body — otherwise anyone could put somebody else's name on a sheet.
export type NewPdSheet = Omit<
  PdSheet,
  "id" | "pdNo" | "fy" | "seq" | "createdAt" | "updatedAt" | "pieces"
  | "createdBy" | "updatedBy"
>;

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
    // The category is the product: one value, two names, so nothing downstream
    // has to learn a new one.
    product: s("category") || s("product"),
    category: s("category") || s("product"),
    subCategory: s("subCategory"), subSubCategory: s("subSubCategory"),
    tdw: s("tdw"),
    type: s("type"), diaQuality: s("diaQuality"), goldWeight: s("goldWeight"),
    locks: s("locks"), orderType: s("orderType"), assignedDate: s("assignedDate"),
    assignedTo: s("assignedTo"), size: s("size"), diaShape: s("diaShape"), zone: s("zone"),
    goldPurity: s("goldPurity"), goldColor: s("goldColor"), priceRange: s("priceRange"),
    diaWeightPointers: s("diaWeightPointers"), quantity: s("quantity"),
    orderBy: s("orderBy"), deliveryDate: s("deliveryDate"),
    pdMerchandiser: s("pdMerchandiser"), remarks: s("remarks"),
    diaLines: normalizeDiaLines(body.diaLines),
  };
}

// Diamond rows arrive as free text from the picker; keep only strings.
function normalizeDiaLines(input: unknown): DiaLine[] {
  if (!Array.isArray(input)) return [];
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return input
    .map((raw) => {
      const r = raw as Partial<DiaLine>;
      return {
        shape: str(r.shape), size: str(r.size), mm: str(r.mm),
        pointer: str(r.pointer), pcs: str(r.pcs),
        // Which pieces of the run this size is set into. Blank is the ordinary
        // case and means all of them.
        pieces: str(r.pieces),
      };
    })
    .filter((l) => l.shape || l.size || l.mm || l.pointer || l.pcs);
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

export async function createPdSheet(input: NewPdSheet, by = ""): Promise<PdSheet> {
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
    pieces: reconcilePieces(input.sku, []),
    createdBy: by || undefined,
    updatedBy: by || undefined,
    createdAt: now,
    updatedAt: now,
  };
  db.sheets.push(sheet);
  await writeDB(db, token);
  return sheet;
}

// Sheets written before pieces existed have none stored, so the list is worked
// out on the way out as well as on the way in. It is a handful of entries per
// sheet, and it means every reader sees the same pieces the design number says.
function hydrate(sheet: PdSheet): PdSheet {
  return { ...sheet, pieces: reconcilePieces(sheet.sku, sheet.pieces) };
}

export async function listPdSheets(): Promise<PdSheet[]> {
  const token = requireToken();
  const db = await readDB(token);
  return db.sheets
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(hydrate);
}

export async function getPdSheet(id: string): Promise<PdSheet | null> {
  const token = requireToken();
  const db = await readDB(token);
  const sheet = db.sheets.find((s) => s.id === id);
  return sheet ? hydrate(sheet) : null;
}

// Identity fields (id, pdNo, fy, seq, createdAt) are preserved on edit.
export async function updatePdSheet(
  id: string, patch: NewPdSheet, by = ""
): Promise<PdSheet | null> {
  const token = requireToken();
  const db = await readDB(token);
  const idx = db.sheets.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const updated: PdSheet = {
    ...db.sheets[idx],
    ...patch,
    // Correcting the design number re-cuts the run; anything already recorded
    // against a piece that survives the change is kept.
    pieces: reconcilePieces(patch.sku, db.sheets[idx].pieces),
    // Who made it never changes; who last touched it does.
    updatedBy: by || db.sheets[idx].updatedBy,
    updatedAt: new Date().toISOString(),
  };
  db.sheets[idx] = updated;
  await writeDB(db, token);
  return updated;
}

// Progress on the individual pieces, saved without touching the rest of the
// sheet. What comes in is treated as values to overlay, not as the list itself:
// the list is still derived from the design number.
export async function setPdPieces(id: string, incoming: PdPiece[]): Promise<PdSheet | null> {
  const token = requireToken();
  const db = await readDB(token);
  const idx = db.sheets.findIndex((s) => s.id === id);
  if (idx === -1) return null;

  const updated: PdSheet = {
    ...db.sheets[idx],
    pieces: reconcilePieces(db.sheets[idx].sku, incoming),
    updatedAt: new Date().toISOString(),
  };
  db.sheets[idx] = updated;
  await writeDB(db, token);
  return updated;
}

// Diamonds going out against a piece is the moment it starts being made, so
// the jangad register moves the PD sheet on rather than leaving someone to
// remember to. Only pieces still waiting are touched: one already ready, in
// stock or cancelled is further along than this knows about.
export async function markPiecesInProduction(
  id: string,
  pieceNos: string[]
): Promise<PdSheet | null> {
  if (!pieceNos.length) return null;
  const token = requireToken();
  const db = await readDB(token);
  const idx = db.sheets.findIndex((s) => s.id === id);
  if (idx === -1) return null;

  const flat = (s: string) => (s || "").toUpperCase().replace(/[^A-Z0-9.]/g, "");
  const wanted = new Set(pieceNos.map(flat));
  const pieces = reconcilePieces(db.sheets[idx].sku, db.sheets[idx].pieces);

  let changed = false;
  const next = pieces.map((p) => {
    if (p.status !== "pending" || !wanted.has(flat(p.no))) return p;
    changed = true;
    return { ...p, status: "production" as const };
  });
  if (!changed) return db.sheets[idx];

  const updated: PdSheet = {
    ...db.sheets[idx],
    pieces: next,
    updatedAt: new Date().toISOString(),
  };
  db.sheets[idx] = updated;
  await writeDB(db, token);
  return updated;
}

export function normalizePieceInput(input: unknown): PdPiece[] {
  if (!Array.isArray(input)) return [];
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return input
    .map((raw) => {
      const p = raw as Partial<PdPiece>;
      return {
        no: str(p.no),
        n: typeof p.n === "number" ? p.n : 0,
        status: isPieceStatus(p.status) ? p.status : ("pending" as const),
        stockNo: str(p.stockNo).toUpperCase(),
        note: str(p.note),
      };
    })
    .filter((p) => p.no);
}

export type DesignLookup = { sheet: PdSheet; hit: DesignHit };

// The design number as a key: given anything from a full piece number down to
// part of a design number, find the sheets it names. Exact piece hits sort
// first — that is what someone holding one unlabelled piece is asking for.
export async function findByDesignNo(query: string): Promise<DesignLookup[]> {
  const sheets = await listPdSheets();
  const hits: DesignLookup[] = [];
  for (const sheet of sheets) {
    const hit = matchDesign(sheet.sku, query);
    if (hit) hits.push({ sheet, hit });
  }
  return hits.sort((a, b) =>
    a.hit.kind === b.hit.kind ? 0 : a.hit.kind === "piece" ? -1 : 1
  );
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

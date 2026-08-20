// Diamond jangad register store — same private Vercel Blob pattern as the
// other modules, in its own JSON document.
//
// Unlike memos or PD sheets this is not a document with a number: it is a
// ledger, one row per piece per diamond size, matching the accountant's
// workbook. Rows are added in batches when diamonds are issued, then filled in
// over the following weeks as jewellery and stones come back.
import "server-only";
import { get, put, BlobNotFoundError } from "@vercel/blob";
import {
  BLANK_JANGAD, JANGAD_FIELDS, suggestedPieces,
  type JangadField, type JangadRow,
} from "./jangadConfig";
import { getPdSheet, findByDesignNo, markPiecesInProduction } from "./pdStore";
import { listDemands } from "./demandStore";
import { todayInput } from "./memoFormat";
import {
  joinDesignNo, pieceNumbers, parseDesignNo, type PdPiece,
} from "./designNo";

const DB_PATH = "jangad/db.json";

export type JangadDB = { rows: JangadRow[]; seq: number };

export function isJangadStorageConfigured(): boolean {
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

async function readDB(token: string): Promise<JangadDB> {
  try {
    const result = await get(DB_PATH, { access: "private", token, useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return { rows: [], seq: 0 };
    const db = (await new Response(result.stream).json()) as Partial<JangadDB>;
    return { rows: db.rows || [], seq: db.seq || 0 };
  } catch (err) {
    if (err instanceof BlobNotFoundError) return { rows: [], seq: 0 };
    throw err;
  }
}

async function writeDB(db: JangadDB, token: string): Promise<void> {
  await put(DB_PATH, JSON.stringify(db), {
    access: "private",
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

// Every column is free text — the workbook's own columns are — so normalising
// an incoming row is trimming the 25 fields and ignoring anything else sent.
export function normalizeJangadRow(input: unknown): Record<JangadField, string> {
  const body = (input || {}) as Record<string, unknown>;
  const out = { ...BLANK_JANGAD };
  for (const k of JANGAD_FIELDS) {
    const v = body[k];
    if (typeof v === "string") out[k] = v.trim();
  }
  return out;
}

function isEmptyRow(r: Record<JangadField, string>): boolean {
  return JANGAD_FIELDS.every((k) => !r[k]);
}

export async function listJangad(): Promise<JangadRow[]> {
  const token = requireToken();
  const db = await readDB(token);
  // Newest batch first, but a batch keeps the order it was entered in so the
  // pieces of one design stay together and in number order.
  return db.rows.slice().sort((a, b) => (a.createdAt === b.createdAt
    ? a.id.localeCompare(b.id, undefined, { numeric: true })
    : a.createdAt < b.createdAt ? 1 : -1));
}

// The rows behind a print, in the order they were asked for — the slip should
// read in the order the register showed, not in storage order.
export async function getJangadRows(ids: string[]): Promise<JangadRow[]> {
  const token = requireToken();
  const db = await readDB(token);
  const byId = new Map(db.rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is JangadRow => !!r);
}

export async function getJangadRow(id: string): Promise<JangadRow | null> {
  const token = requireToken();
  const db = await readDB(token);
  return db.rows.find((r) => r.id === id) || null;
}

export type JangadLink = {
  pdId?: string;
  pdNo?: string;
  demandNo?: string;
  // The design number as the PD sheet writes it, run and all. The register
  // splits a piece across two columns, so this is the only place the whole run
  // survives — and it is how a search for it finds these rows again.
  runNo?: string;
};

export async function addJangadRows(
  rows: Record<JangadField, string>[],
  link: JangadLink = {}
): Promise<JangadRow[]> {
  const token = requireToken();
  const db = await readDB(token);
  const now = new Date().toISOString();

  const added: JangadRow[] = [];
  for (const r of rows) {
    if (isEmptyRow(r)) continue;
    db.seq += 1;
    added.push({
      ...r,
      id: `JG-${String(db.seq).padStart(5, "0")}`,
      pdId: link.pdId,
      pdNo: link.pdNo,
      demandNo: link.demandNo,
      runNo: link.runNo,
      createdAt: now,
      updatedAt: now,
    });
  }
  if (!added.length) return [];

  db.rows.push(...added);
  await writeDB(db, token);

  // Diamonds with the factory means the piece is being made, so the PD sheet
  // says so rather than still reading "pending" the next time it is opened.
  // Best-effort: the register is saved either way, and a piece already further
  // along is left where it is.
  if (link.pdId) {
    const pieces = [...new Set(
      added.map((r) => joinDesignNo(r.designNo, r.subDesignNo, "")).filter(Boolean)
    )];
    await markPiecesInProduction(link.pdId, pieces).catch(() => {});
  }
  return added;
}

export async function updateJangadRow(
  id: string,
  patch: Record<JangadField, string>
): Promise<JangadRow | null> {
  const token = requireToken();
  const db = await readDB(token);
  const idx = db.rows.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const updated: JangadRow = { ...db.rows[idx], ...patch, updatedAt: new Date().toISOString() };
  db.rows[idx] = updated;
  await writeDB(db, token);
  return updated;
}

// Saving a screenful at once: the accountant fills in a whole design's rows and
// presses save once, so one read and one write cover the lot.
export async function updateJangadRows(
  patches: { id: string; row: Record<JangadField, string> }[]
): Promise<JangadRow[]> {
  const token = requireToken();
  const db = await readDB(token);
  const now = new Date().toISOString();
  const touched: JangadRow[] = [];
  for (const p of patches) {
    const idx = db.rows.findIndex((r) => r.id === p.id);
    if (idx === -1) continue;
    db.rows[idx] = { ...db.rows[idx], ...p.row, updatedAt: now };
    touched.push(db.rows[idx]);
  }
  if (!touched.length) return [];
  await writeDB(db, token);
  return touched;
}

export async function deleteJangadRow(id: string): Promise<boolean> {
  const token = requireToken();
  const db = await readDB(token);
  const before = db.rows.length;
  db.rows = db.rows.filter((r) => r.id !== id);
  if (db.rows.length === before) return false;
  await writeDB(db, token);
  return true;
}

export async function exportJangadDb(): Promise<JangadDB> {
  const token = requireToken();
  return readDB(token);
}

// --- Auto-fetch from a design number -----------------------------------------

export type JangadSeed = {
  pdId: string;
  pdNo: string;
  designNo: string;
  product: string;
  demandNo: string;
  // Who the design is with in the factory — the PD sheet already says.
  assignedTo: string;
  pieces: {
    no: string;
    status: string;
    stockNo: string;
    suggested: boolean;
    // Set when this piece already has entries in the register, so the same
    // stones cannot be issued twice without it being obvious.
    issued?: { date: string; memoNo: string; mfgName: string; rows: number };
  }[];
  // One per diamond size on the design, ready to be crossed with the pieces.
  lines: {
    shape: string; size: string; pcs: string; growth: string;
    // Which pieces of the run this size is set into, straight off the PD sheet.
    // Blank means all of them.
    pieces?: string;
  }[];
};

// Everything the accountant would otherwise copy out of the PD sheet by hand.
//
// The design number is the way in — a whole run ("SN-BR-AMF-41-49") or one
// piece of it ("SN-BR-AMF-46"), because by this point that piece may be the
// only thing written on the packet.
export async function seedFromDesign(query: string): Promise<JangadSeed | null> {
  const hits = await findByDesignNo(query);
  if (!hits.length) return null;
  const { sheet, hit } = hits[0];

  // Its diamond demand, if one was raised — that is where CVD/HPHT is decided.
  const demands = await listDemands().catch(() => []);
  const demand = demands.find((d) => d.pdId === sheet.id);
  const growthFor = (shape: string) =>
    demand?.rows.find((r) => r.shape.trim().toLowerCase() === shape.trim().toLowerCase())
      ?.growth || demand?.rows[0]?.growth || "CVD";

  const lines = (sheet.diaLines || [])
    .filter((l) => l.shape || l.size || l.mm || l.pcs)
    .map((l) => ({
      shape: l.shape.trim().toUpperCase(),
      // Round stones are known by their sieve name, fancy ones by their MM.
      size: (l.size.trim() || l.mm.trim()),
      pcs: l.pcs.trim(),
      // Carats are left for the accountant: what goes in a bag is weighed, and
      // a figure worked out from the size would pass for that measurement.
      growth: growthFor(l.shape),
      pieces: l.pieces || "",
    }));

  // Searching for one piece means that piece; searching the design offers the
  // ones actually in production, since those are what diamonds go out against.
  const all: PdPiece[] = sheet.pieces?.length
    ? sheet.pieces
    : pieceNumbers(parseDesignNo(sheet.sku)).map((no, i) => ({
        no, n: i, status: "pending" as const, stockNo: "", note: "",
      }));

  // What the register already holds for this design. Without this the picker
  // offers pieces whose diamonds went out weeks ago, and a second issue against
  // the same piece looks exactly like the first.
  const db = await readDB(requireToken());
  const already = new Map<string, { date: string; memoNo: string; mfgName: string; rows: number }>();
  for (const r of db.rows) {
    const key = flatNo(joinDesignNo(r.designNo, r.subDesignNo, ""));
    if (!key) continue;
    const seen = already.get(key);
    if (seen) { seen.rows += 1; continue; }
    already.set(key, { date: r.date, memoNo: r.memoNo, mfgName: r.mfgName, rows: 1 });
  }

  const named = hit.kind === "piece" ? hit.piece : "";
  const issuedOf = (no: string) => already.get(flatNo(no));
  const suggested = new Set(
    suggestedPieces(
      all.map((p) => ({ no: p.no, status: p.status, issued: !!issuedOf(p.no) })),
      named
    )
  );

  return {
    pdId: sheet.id,
    pdNo: sheet.pdNo,
    designNo: sheet.sku,
    product: sheet.product,
    demandNo: demand?.demandNo || "",
    assignedTo: sheet.assignedTo,
    pieces: all.map((p) => ({
      no: p.no,
      status: p.status,
      stockNo: p.stockNo,
      suggested: suggested.has(p.no),
      issued: issuedOf(p.no),
    })),
    lines,
  };
}

// Used by the register to show a design's PD sheet alongside its rows.
export async function pdForRow(row: JangadRow) {
  if (!row.pdId) return null;
  return getPdSheet(row.pdId).catch(() => null);
}

export function jangadDate(): string {
  return todayInput();
}

// Design numbers are compared without their separators, so a piece written
// "SN-BR-AMF-10CT-63" matches the register's "SN-BR-AMF-10CT" + "63".
function flatNo(s: string): string {
  return (s || "").toUpperCase().replace(/[^A-Z0-9.]/g, "");
}

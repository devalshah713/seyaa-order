// Diamond jangad register store — same shared-storage pattern as the
// other modules, in its own JSON document, and now also in Cloudflare D1.
//
// Unlike memos or PD sheets this is not a document with a number: it is a
// ledger, one row per piece per diamond size, matching the accountant's
// workbook. Rows are added in batches when diamonds are issued, then filled in
// over the following weeks as jewellery and stones come back.
//
// --- Why there is a second store ------------------------------------------
//
// Because the first one stopped working. The register is the portal's biggest
// ledger, thousands of rows of 28 columns, and saving one cell of one row read
// the whole document, changed that cell and wrote the whole document back. On
// Cloudflare's free plan a request may use ten thousandths of a second of
// computing time; that save had grown past it, so the Worker was being killed
// part way through and /jangad was answering 503 and then crashing the page in
// the browser. Nothing was being wasted. The cost was the document.
//
// The memo book was moved into Cloudflare's own database for the same reason
// two days earlier, and the register follows it. In D1 a save is one row, and a
// row costs the same at forty thousand entries as at four.
//
// --- Which store is used ---------------------------------------------------
//
// D1, if and only if the database is attached to the Worker AND the register has
// been copied into it. Otherwise the JSON document in R2, exactly as before,
// every line of which is still here and untouched.
//
// There is no half-way: the copy sets one flag when every row is across, and
// that flag is the switch. So this can be deployed before the database exists,
// and the database can be filled before or after the deploy, and neither order
// leaves a window where the register reads as empty. That matters more here
// than anywhere: the R2 path reads, changes and writes whole, so a register
// misread as empty would put a blank document over the real one on the next
// save.
//
// Nothing is ever deleted from R2. After the switch the document stays as it was
// on the day of the move, a complete readable copy of the register up to that
// moment.
//
// --- What did not move ------------------------------------------------------
//
// The PD sheets, the demands and the receipt chase this file talks to are all
// still in R2 and are reached the same way whichever store the register is in.
// The register's own move was the thing that could not wait; theirs is a
// separate decision for a separate day.
import "server-only";
import { isDbConfigured, readDoc, writeDoc } from "./db";
import { hasSql } from "./sql";
import { jangadIsInSql } from "./sqlSchema";
import {
  jangadIdTemplate,
  sqlAddJangadRows,
  sqlDeleteJangadRow,
  sqlGetJangadRow,
  sqlGetJangadRows,
  sqlJangadIssueLines,
  sqlJangadSeq,
  sqlListJangad,
  sqlUpdateJangadRow,
  sqlUpdateJangadRows,
  type JangadIssueLine,
} from "./jangadSql";
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
  return isDbConfigured();
}

// Is D1 where the register lives?
//
// Both halves have to be true: the database has to be attached, and the rows
// have to be in it. Asked on every call rather than worked out once, because the
// day the copy runs is a day when the answer changes without a deploy.
async function useSql(): Promise<boolean> {
  return hasSql() && (await jangadIsInSql());
}

// The register's entry numbers. JG-04910 is the four thousand nine hundred and
// tenth row ever entered, and the format is written down here only: the D1 half
// is handed this same function to learn it from.
export function jangadIdFor(seq: number): string {
  return `JG-${String(seq).padStart(5, "0")}`;
}

async function readDB(): Promise<JangadDB> {
  const db = await readDoc<Partial<JangadDB>>(DB_PATH, {});
  return { rows: db.rows || [], seq: db.seq || 0 };
}

// The document as it really is, for the copy into D1. readDB() fills in the
// defaults, which is right everywhere it is used and would quietly invent a
// register out of a document that could not be read.
export async function readJangadDoc(): Promise<Partial<JangadDB>> {
  return readDoc<Partial<JangadDB>>(DB_PATH, {});
}

async function writeDB(db: JangadDB): Promise<void> {
  await writeDoc(DB_PATH, db);
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
  // The database sorts it, by the same three keys and to the same order. See
  // sqlListJangad().
  if (await useSql()) return sqlListJangad();

  const db = await readDB();
  // Newest batch first, but a batch keeps the order it was entered in so the
  // pieces of one design stay together and in number order.
  return db.rows.slice().sort((a, b) => (a.createdAt === b.createdAt
    ? a.id.localeCompare(b.id, undefined, { numeric: true })
    : a.createdAt < b.createdAt ? 1 : -1));
}

// The rows behind a print, in the order they were asked for — the slip should
// read in the order the register showed, not in storage order.
export async function getJangadRows(ids: string[]): Promise<JangadRow[]> {
  if (await useSql()) return sqlGetJangadRows(ids);

  const db = await readDB();
  const byId = new Map(db.rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is JangadRow => !!r);
}

export async function getJangadRow(id: string): Promise<JangadRow | null> {
  if (await useSql()) return sqlGetJangadRow(id);

  const db = await readDB();
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
  const now = new Date().toISOString();

  // The rows as they will be stored, bar their entry numbers: whichever store
  // takes them is the one that decides those, because the number has to be
  // taken and used without anything in between reading it.
  const drafts: JangadRow[] = [];
  for (const r of rows) {
    if (isEmptyRow(r)) continue;
    drafts.push({
      ...r,
      id: "",
      pdId: link.pdId,
      pdNo: link.pdNo,
      demandNo: link.demandNo,
      runNo: link.runNo,
      createdAt: now,
      updatedAt: now,
    });
  }
  if (!drafts.length) return [];

  // In the database the batch is one statement and the register is never read.
  // Against the document it still is what it always was: the whole register
  // read in, the batch appended, the whole register written back out.
  const added = (await useSql())
    ? await sqlAddJangadRows(drafts, jangadIdTemplate(jangadIdFor))
    : await addRowsToDoc(drafts);

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

// The batch into the JSON document, which is what runs until the register has
// been copied across. Unchanged: the register is read, the batch takes the next
// numbers from the document's own counter, and the register is written back.
async function addRowsToDoc(drafts: JangadRow[]): Promise<JangadRow[]> {
  const db = await readDB();
  const added = drafts.map((draft) => {
    db.seq += 1;
    return { ...draft, id: jangadIdFor(db.seq) };
  });
  db.rows.push(...added);
  await writeDB(db);
  return added;
}

export async function updateJangadRow(
  id: string,
  patch: Record<JangadField, string>
): Promise<JangadRow | null> {
  // One row, one statement. This is the save that was failing: the register has
  // grown past what a Worker may write in ten thousandths of a second, and
  // rewriting it to change one cell is what put /jangad on the floor.
  if (await useSql()) {
    return sqlUpdateJangadRow(id, patch, new Date().toISOString());
  }

  const db = await readDB();
  const idx = db.rows.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const updated: JangadRow = { ...db.rows[idx], ...patch, updatedAt: new Date().toISOString() };
  db.rows[idx] = updated;
  await writeDB(db);
  return updated;
}

// Saving a screenful at once: the accountant fills in a whole design's rows and
// presses save once, so one read and one write cover the lot.
export async function updateJangadRows(
  patches: { id: string; row: Record<JangadField, string> }[]
): Promise<JangadRow[]> {
  // One statement for the screenful, however many lines it holds, and only the
  // lines that changed are written. See sqlUpdateJangadRows().
  if (await useSql()) return sqlUpdateJangadRows(patches, new Date().toISOString());

  const db = await readDB();
  const now = new Date().toISOString();
  const touched: JangadRow[] = [];
  for (const p of patches) {
    const idx = db.rows.findIndex((r) => r.id === p.id);
    if (idx === -1) continue;
    db.rows[idx] = { ...db.rows[idx], ...p.row, updatedAt: now };
    touched.push(db.rows[idx]);
  }
  if (!touched.length) return [];
  await writeDB(db);
  return touched;
}

export async function deleteJangadRow(id: string): Promise<boolean> {
  if (await useSql()) return sqlDeleteJangadRow(id);

  const db = await readDB();
  const before = db.rows.length;
  db.rows = db.rows.filter((r) => r.id !== id);
  if (db.rows.length === before) return false;
  await writeDB(db);
  return true;
}

// The whole register as one document, for the nightly backup.
//
// The running number goes with it, as it always has: a restore that brought the
// rows back without it would start the register again at JG-00001 and write
// second entries under numbers that are already on the books.
export async function exportJangadDb(): Promise<JangadDB> {
  if (await useSql()) {
    const [rows, seq] = await Promise.all([sqlListJangad(), sqlJangadSeq()]);
    return { rows, seq };
  }
  return readDB();
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
    issued?: {
      date: string; memoNo: string; mfgName: string; rows: number;
      // Every distinct stone size already out against this piece, as it reads
      // on the register — "ROUND +15.5-16 45 pcs".
      sizes: string[];
    };
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
  // Eight columns of every row ever entered, which is all this needs. From the
  // database that is eight columns; from the document there is only the whole
  // register, as there always was.
  const issuedLines: JangadIssueLine[] = (await useSql())
    ? await sqlJangadIssueLines()
    : (await readDB()).rows;
  const already = new Map<string, {
    date: string; memoNo: string; mfgName: string; rows: number; sizes: string[];
  }>();
  for (const r of issuedLines) {
    const key = flatNo(joinDesignNo(r.designNo, r.subDesignNo, ""));
    if (!key) continue;
    // What the piece already holds, so an add-on can be written against the
    // size that actually broke rather than looked up in the old paperwork.
    const label = [r.shape, r.size, r.pcs && `${r.pcs} pcs`]
      .map((x) => (x || "").trim()).filter(Boolean).join(" ");
    const seen = already.get(key);
    if (seen) {
      seen.rows += 1;
      if (label && !seen.sizes.includes(label)) seen.sizes.push(label);
      continue;
    }
    already.set(key, {
      date: r.date, memoNo: r.memoNo, mfgName: r.mfgName, rows: 1,
      sizes: label ? [label] : [],
    });
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

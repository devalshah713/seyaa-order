// Product Development (PD) sheet store — same shared-storage pattern as
// memoStore, in its own JSON document, and now also in Cloudflare D1.
//
// --- Why there is a second store ------------------------------------------
//
// Because of what a save cost. Every PD sheet in the book sat in one JSON
// document, read whole and written whole, so marking one piece of one design as
// being made wrote every sheet in the book; so did pointing a photo somewhere
// else, and so did the diamonds going out on the jangad, which moves the sheet
// on by itself. On Cloudflare's free plan a request may use ten thousandths of a
// second of computing time, and this was the heaviest write left in the portal
// once the memo book and the jangad register had moved. Nothing was being
// wasted. The cost was the document.
//
// In D1 a save is one row, and a row costs the same at four thousand sheets as
// at four.
//
// --- Which store is used ---------------------------------------------------
//
// D1, if and only if the database is attached to the Worker AND the sheets have
// been copied into it. Otherwise the JSON document in R2, exactly as before,
// every line of which is still here and untouched.
//
// There is no half-way: the copy sets one flag when every sheet is across, and
// that flag is the switch. So this can be deployed before the database exists,
// and the database can be filled before or after the deploy, and neither order
// leaves a window where the book reads as empty. That matters: the R2 path
// reads, changes and writes whole, so a book misread as empty would put a blank
// document over the real one on the next save.
//
// Nothing is ever deleted from R2. After the switch the document stays as it was
// on the day of the move, a complete readable copy of every sheet up to that
// moment.
//
// --- What the pieces are ---------------------------------------------------
//
// One thing about this module is worth saying twice, because it decides the
// shape of the table. A sheet's `pieces` are not stored authority: they are
// rebuilt from the design number by reconcilePieces() on the way in and on the
// way out, so a corrected design number can never leave the number and the
// pieces disagreeing. That is still exactly what happens here. `doc` holds the
// sheet as stored and the rebuild happens on the way out, in hydrate(), as it
// always has. No column holds the piece list.
import "server-only";
import { isDbConfigured, readDoc, writeDoc } from "./db";
import { fyFromInput, pad, stockKey, todayInput } from "./memoFormat";
import { hasSql } from "./sql";
import { pdIsInSql } from "./sqlSchema";
import { numberTemplate } from "./sqlRecords";
import {
  sqlCreatePdSheet,
  sqlDeletePdSheet,
  sqlGetPdSheet,
  sqlListPdSheets,
  sqlPdCounter,
  sqlPdCounters,
  sqlPdDesigns,
  sqlPdRows,
  sqlPdSheetsByIds,
  sqlPdSku,
  sqlPdStockedByNos,
  sqlPutPdSheet,
  sqlSetPdPhoto,
  sqlSetPdPieces,
  type PdStockHit,
} from "./pdSql";
import type { DiaLine } from "./pdConfig";
import {
  isPieceStatus, matchDesign, parseDesignNo, pieceTotal, piecesInStock,
  reconcilePieces, stockedPieces,
  type DesignHit, type PdPiece,
} from "./designNo";

const DB_PATH = "pd/db.json";

export type PdSheet = {
  id: string; // e.g. "PD-26-27-001"
  pdNo: string; // e.g. "PD/26-27/001"
  fy: string;
  seq: number;

  // Where the design photo is. Two shapes, both valid — see photoSrc():
  // a Cloudinary URL on anything saved since the switch, and a private Blob
  // pathname on older sheets until the migration has moved them.
  photoPath: string;
  // Cloudinary's own handle for the image. Optional because Blob-era sheets
  // never had one and inventing one would be worse than leaving it blank.
  photoPublicId?: string;
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
  return isDbConfigured();
}

// Every PD field is free text by design (the form's combos accept new values),
// so normalising an incoming request body is just trimming the strings.
export function normalizePdInput(body: Record<string, unknown>): NewPdSheet {
  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  return {
    photoPath: s("photoPath"), photoPublicId: s("photoPublicId"), sku: s("sku"),
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

// Is D1 where the sheets live?
//
// Both halves have to be true: the database has to be attached, and the sheets
// have to be in it. Asked on every call rather than worked out once, because the
// day the copy runs is a day when the answer changes without a deploy.
async function useSql(): Promise<boolean> {
  return hasSql() && (await pdIsInSql());
}

// How a sheet's number is printed, written down here only. The D1 half is
// handed these same two functions to learn the formats from, so there is no
// second copy of them to drift.
export function pdIdFor(fy: string, seq: number): string {
  return `PD-${fy}-${pad(seq)}`;
}

export function pdNoFor(fy: string, seq: number): string {
  return `PD/${fy}/${pad(seq)}`;
}

async function readDB(): Promise<PdDB> {
  const db = await readDoc<Partial<PdDB>>(DB_PATH, {});
  return { counters: db.counters || {}, sheets: db.sheets || [] };
}

// The document as it really is, for the copy into D1. readDB() fills in the
// defaults, which is right everywhere it is used and would quietly invent an
// empty book out of a document that could not be read.
export async function readPdDoc(): Promise<Partial<PdDB>> {
  return readDoc<Partial<PdDB>>(DB_PATH, {});
}

async function writeDB(db: PdDB): Promise<void> {
  await writeDoc(DB_PATH, db);
}

export async function createPdSheet(input: NewPdSheet, by = ""): Promise<PdSheet> {
  const date = input.assignedDate || todayInput();
  const fy = fyFromInput(date);
  const now = new Date().toISOString();

  // The sheet as it will be stored, bar its number: whichever store takes it is
  // the one that decides that, because the number has to be taken and used
  // without anything in between reading it.
  const draft: PdSheet = {
    ...input,
    id: "",
    pdNo: "",
    fy,
    seq: 0,
    pieces: reconcilePieces(input.sku, []),
    createdBy: by || undefined,
    updatedBy: by || undefined,
    createdAt: now,
    updatedAt: now,
  };

  // In the database the number is raised and used inside one transaction, so
  // two sheets saved in the same moment take 012 and 013 and never both 012.
  // Against the document it still is what it always was: the whole book read
  // in, the counter raised, the whole book written back.
  if (await useSql()) {
    return sqlCreatePdSheet(draft, fy, {
      id: numberTemplate((seq) => pdIdFor(fy, seq)),
      no: numberTemplate((seq) => pdNoFor(fy, seq)),
    });
  }
  return createInDoc(draft, fy);
}

// The sheet into the JSON document, which is what runs until the book has been
// copied across. Unchanged: the book is read, the next number comes off the
// document's own counter, and the book is written back.
async function createInDoc(draft: PdSheet, fy: string): Promise<PdSheet> {
  const db = await readDB();
  const seq = (db.counters[fy] || 0) + 1;
  db.counters[fy] = seq;
  const sheet: PdSheet = { ...draft, id: pdIdFor(fy, seq), pdNo: pdNoFor(fy, seq), seq };
  db.sheets.push(sheet);
  await writeDB(db);
  return sheet;
}

// Sheets written before pieces existed have none stored, so the list is worked
// out on the way out as well as on the way in. It is a handful of entries per
// sheet, and it means every reader sees the same pieces the design number says.
function hydrate(sheet: PdSheet): PdSheet {
  return { ...sheet, pieces: reconcilePieces(sheet.sku, sheet.pieces) };
}

export async function listPdSheets(): Promise<PdSheet[]> {
  // The database sorts it, by the same key and to the same order.
  if (await useSql()) return (await sqlListPdSheets()).map(hydrate);

  const db = await readDB();
  return db.sheets
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(hydrate);
}

// The same sheets in the same order, but exactly as they are stored.
//
// Hydrating is the expensive half of listPdSheets: every sheet's piece list is
// rebuilt from its design number, which on a book with bulk runs in it is
// thousands of objects. A reader that never looks at `pieces` is paying for all
// of them for nothing, and on a ten millisecond request budget that is the
// difference between a page rendering and a page failing. The design trace is
// such a reader: it takes the design and gold fields off the sheet and never
// touches the piece list, so it reads the sheets through here instead.
export async function listPdSheetsRaw(): Promise<PdSheet[]> {
  if (await useSql()) return sqlListPdSheets();

  const db = await readDB();
  return db.sheets.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// --- The list page's own shape -----------------------------------------------

// One row of the PD list, and nothing else.
//
// The list used to be handed whole PdSheets. That is expensive twice over: every
// sheet's piece list is built on the way out, which for a book with bulk runs in
// it is thousands of objects nobody asked for, and then React writes all of it
// into the page because the table is a client component. Measured on a few
// hundred sheets it came to roughly fifty milliseconds and half a megabyte, and
// a request is allowed ten milliseconds, so the page stopped rendering at all.
//
// What the table actually needs is these fields, the piece count, and the few
// pieces carrying a stock number. The rest never reaches the browser.
export type PdRowPiece = { no: string; stockNo: string };

export type PdRow = {
  id: string;
  pdNo: string;
  sku: string;
  // Shown in the table.
  product: string;
  assignedTo: string;
  deliveryDate: string;
  quantity: string;
  createdBy?: string;
  updatedBy?: string;
  // Searched, but not shown.
  category: string;
  subCategory: string;
  pdMerchandiser: string;
  zone: string;
  orderType: string;
  diaQuality: string;
  // The Pieces column.
  total: number;
  inStock: number;
  // Only the pieces that reached the stock sheet, so a stock number still finds
  // its design. A piece nobody has touched says nothing and is left out.
  stocked: PdRowPiece[];
};

// The row, from the fields the list was given, whichever store they came from.
//
// Only two things are worked out here rather than taken as they stand, and both
// have to be worked out on the way out rather than stored: the piece count
// follows the design number, and the design number can be corrected after
// pieces have been recorded. So the count is read off the number every time,
// and the number in stock is held to it.
type PdRowFields = Omit<PdRow, "total" | "inStock"> & { inStock: number };

function rowFrom(f: PdRowFields): PdRow {
  const total = pieceTotal(parseDesignNo(f.sku));
  return {
    ...f,
    total,
    // A sheet shortened after pieces were recorded could otherwise read as more
    // in stock than it has pieces.
    inStock: Math.min(f.inStock, total),
  };
}

function toRow(s: PdSheet): PdRow {
  // Stored pieces are always already reconciled against the stored design
  // number — every write goes through reconcilePieces — so they can be counted
  // as they stand, without rebuilding the run to check them. The database keeps
  // the same two answers as columns, worked out by these same two functions
  // when the sheet was saved.
  const saved = s.pieces || [];
  return rowFrom({
    id: s.id,
    pdNo: s.pdNo,
    sku: s.sku,
    product: s.product,
    assignedTo: s.assignedTo,
    deliveryDate: s.deliveryDate,
    quantity: s.quantity,
    createdBy: s.createdBy,
    updatedBy: s.updatedBy,
    category: s.category,
    subCategory: s.subCategory,
    pdMerchandiser: s.pdMerchandiser,
    zone: s.zone,
    orderType: s.orderType,
    diaQuality: s.diaQuality,
    inStock: piecesInStock(saved),
    stocked: stockedPieces(saved),
  });
}

export async function listPdRows(): Promise<PdRow[]> {
  // From the database this is the list's own columns and no sheet read whole.
  // See sqlPdRows().
  if (await useSql()) return (await sqlPdRows()).map(rowFrom);

  const db = await readDB();
  return db.sheets
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(toRow);
}

export async function getPdSheet(id: string): Promise<PdSheet | null> {
  if (await useSql()) {
    const sheet = await sqlGetPdSheet(id);
    return sheet ? hydrate(sheet) : null;
  }

  const db = await readDB();
  const sheet = db.sheets.find((s) => s.id === id);
  return sheet ? hydrate(sheet) : null;
}

export async function updatePdSheet(
  id: string, patch: NewPdSheet, by = ""
): Promise<PdSheet | null> {
  // One sheet read and one sheet written, rather than the book twice. The read
  // is needed and cannot be done in the database: an edit keeps the identity
  // fields and re-cuts the run against whatever was already recorded on each
  // piece, so the sheet as it stands has to be in hand to merge onto.
  if (await useSql()) {
    const current = await sqlGetPdSheet(id);
    if (!current) return null;
    const updated = merged(current, patch, by);
    await sqlPutPdSheet(updated);
    return updated;
  }

  const db = await readDB();
  const idx = db.sheets.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const updated = merged(db.sheets[idx], patch, by);
  db.sheets[idx] = updated;
  await writeDB(db);
  return updated;
}

// An edit onto the sheet as it stands. Identity fields (id, pdNo, fy, seq,
// createdAt) are preserved because the patch does not carry them.
function merged(current: PdSheet, patch: NewPdSheet, by: string): PdSheet {
  return {
    ...current,
    ...patch,
    // Correcting the design number re-cuts the run; anything already recorded
    // against a piece that survives the change is kept.
    pieces: reconcilePieces(patch.sku, current.pieces),
    // Who made it never changes; who last touched it does.
    updatedBy: by || current.updatedBy,
    updatedAt: new Date().toISOString(),
  };
}

// Progress on the individual pieces, saved without touching the rest of the
// sheet. What comes in is treated as values to overlay, not as the list itself:
// the list is still derived from the design number.
export async function setPdPieces(id: string, incoming: PdPiece[]): Promise<PdSheet | null> {

  // One row written. The design number is the only thing that has to be read
  // first, because the piece list is cut from it, and that is one column of one
  // row rather than the book.
  if (await useSql()) {
    const sku = await sqlPdSku(id);
    if (sku === null) return null;
    return writePieces(id, reconcilePieces(sku, incoming));
  }

  const db = await readDB();
  const idx = db.sheets.findIndex((s) => s.id === id);
  if (idx === -1) return null;

  const updated: PdSheet = {
    ...db.sheets[idx],
    pieces: reconcilePieces(db.sheets[idx].sku, incoming),
    updatedAt: new Date().toISOString(),
  };
  db.sheets[idx] = updated;
  await writeDB(db);
  return updated;
}

// The piece list onto one row, with the two columns the list reads written
// beside it so they cannot fall behind the pieces they describe. Worked out by
// the same two functions the list uses, so the figure on screen is the figure
// the list would have reached from the pieces themselves.
async function writePieces(id: string, pieces: PdPiece[]): Promise<PdSheet | null> {
  return sqlSetPdPieces(
    id,
    pieces,
    piecesInStock(pieces),
    stockedPieces(pieces),
    new Date().toISOString()
  );
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

  // One sheet read and one row written. The read cannot be avoided: which
  // pieces move depends on which of them are still waiting, so what is recorded
  // against each one has to be in hand. It is one row either way, not the book.
  if (await useSql()) {
    const current = await sqlGetPdSheet(id);
    if (!current) return null;
    const next = startPieces(current, pieceNos);
    // Nothing waiting among the pieces named, so nothing is written and the
    // sheet is handed back as it stands.
    if (!next) return current;
    return writePieces(id, next);
  }

  const db = await readDB();
  const idx = db.sheets.findIndex((s) => s.id === id);
  if (idx === -1) return null;

  const next = startPieces(db.sheets[idx], pieceNos);
  if (!next) return db.sheets[idx];

  const updated: PdSheet = {
    ...db.sheets[idx],
    pieces: next,
    updatedAt: new Date().toISOString(),
  };
  db.sheets[idx] = updated;
  await writeDB(db);
  return updated;
}

// The sheet's pieces with the named ones moved on, or null when none of them
// was waiting and there is nothing to write.
function startPieces(sheet: PdSheet, pieceNos: string[]): PdPiece[] | null {
  const flat = (s: string) => (s || "").toUpperCase().replace(/[^A-Z0-9.]/g, "");
  const wanted = new Set(pieceNos.map(flat));
  const pieces = reconcilePieces(sheet.sku, sheet.pieces);

  let changed = false;
  const next = pieces.map((p) => {
    if (p.status !== "pending" || !wanted.has(flat(p.no))) return p;
    changed = true;
    return { ...p, status: "production" as const };
  });
  return changed ? next : null;
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

// --- Several stock numbers at once, for the audit ------------------------------

// Which sheet and which piece of it each of these stock numbers was given to.
//
// Only the pieces carrying a stock number are looked at, which is what
// stockedPieces() answers and what the `stocked` column holds. The sheets are
// read as they are stored rather than hydrated: a stored piece list has always
// been reconciled against the stored design number on the way in, which is why
// the list page counts it as it stands too.
export async function pdPiecesForStockNos(keys: string[]): Promise<PdStockHit[]> {
  if (keys.length === 0) return [];
  if (await useSql()) return sqlPdStockedByNos(keys);

  const wanted = new Set(keys);
  const out: PdStockHit[] = [];
  for (const sheet of await listPdSheetsRaw()) {
    for (const piece of stockedPieces(sheet.pieces)) {
      if (!wanted.has(stockKey(piece.stockNo))) continue;
      out.push({
        id: sheet.id,
        pdNo: sheet.pdNo,
        sku: sheet.sku,
        product: sheet.product,
        pieceNo: piece.no,
        stockNo: piece.stockNo,
      });
    }
  }
  return out;
}

export type DesignLookup = { sheet: PdSheet; hit: DesignHit };

// The design number as a key: given anything from a full piece number down to
// part of a design number, find the sheets it names. Exact piece hits sort
// first — that is what someone holding one unlabelled piece is asking for.
export async function findByDesignNo(query: string): Promise<DesignLookup[]> {
  // Matching reads one field, `sku`, so the sheets come in exactly as stored.
  // Rebuilding every sheet's piece list first was the expensive half of the
  // search and all of it was thrown away for the sheets that did not match,
  // which on a book with bulk runs in it is thousands of objects built for
  // nothing. The few that did match are hydrated here instead, so a caller
  // still gets the same sheets with the same piece lists it always got.
  //
  // From the database that same reading becomes two queries: the design numbers
  // and nothing else, and then the sheets that matched. The matching itself
  // stays here, because it cannot be done in SQL. See sqlPdDesigns().
  if (await useSql()) {
    const designs = await sqlPdDesigns();
    const matched: { id: string; hit: DesignHit }[] = [];
    for (const design of designs) {
      const hit = matchDesign(design.sku, query);
      if (hit) matched.push({ id: design.id, hit });
    }
    if (!matched.length) return [];
    const sheets = await sqlPdSheetsByIds(matched.map((m) => m.id));
    const byId = new Map(sheets.map((sheet) => [sheet.id, sheet]));
    const found: DesignLookup[] = [];
    for (const m of matched) {
      const sheet = byId.get(m.id);
      if (sheet) found.push({ sheet: hydrate(sheet), hit: m.hit });
    }
    return byKind(found);
  }

  const sheets = await listPdSheetsRaw();
  const hits: DesignLookup[] = [];
  for (const sheet of sheets) {
    const hit = matchDesign(sheet.sku, query);
    if (hit) hits.push({ sheet: hydrate(sheet), hit });
  }
  return byKind(hits);
}

// Exact piece hits first, which is what someone holding one unlabelled piece is
// asking for. A stable sort, so inside each kind the newest sheet is still
// first, which is the order both stores hand them over in.
function byKind(hits: DesignLookup[]): DesignLookup[] {
  return hits.sort((a, b) =>
    a.hit.kind === b.hit.kind ? 0 : a.hit.kind === "piece" ? -1 : 1
  );
}

export async function deletePdSheet(id: string): Promise<boolean> {
  if (await useSql()) return sqlDeletePdSheet(id);

  const db = await readDB();
  const before = db.sheets.length;
  db.sheets = db.sheets.filter((s) => s.id !== id);
  if (db.sheets.length === before) return false;
  await writeDB(db);
  return true;
}

export async function nextPdNo(dateInput: string): Promise<string> {
  const fy = fyFromInput(dateInput || todayInput());
  // A preview, not a number taken. If somebody else saves first this was a
  // guess, and the number on the saved sheet is the right one.
  if (await useSql()) return pdNoFor(fy, (await sqlPdCounter(fy)) + 1);

  const db = await readDB();
  return pdNoFor(fy, (db.counters[fy] || 0) + 1);
}

// Point one sheet's photo somewhere else, and nothing else.
//
// Deliberately narrower than updatePdSheet, which takes a whole sheet: the
// one-off migration walks every record in turn and must not be able to disturb
// anything it is not moving.
export async function setPdPhoto(
  id: string,
  photoPath: string,
  photoPublicId: string
): Promise<PdSheet | null> {
  // One row written and nothing read first: no column holds the photo, so the
  // database can change it where it sits.
  if (await useSql()) {
    return sqlSetPdPhoto(id, photoPath, photoPublicId, new Date().toISOString());
  }

  const db = await readDB();
  const idx = db.sheets.findIndex((x) => x.id === id);
  if (idx === -1) return null;
  db.sheets[idx] = {
    ...db.sheets[idx],
    photoPath,
    photoPublicId,
    updatedAt: new Date().toISOString(),
  };
  await writeDB(db);
  return db.sheets[idx];
}

// For the nightly backup.
//
// The running numbers go with the sheets, as they always have: a restore that
// brought the sheets back without them would start the book again at 001 and
// write second sheets under numbers that are already on the books.
export async function exportPdDb(): Promise<PdDB> {
  if (await useSql()) {
    const [sheets, counters] = await Promise.all([sqlListPdSheets(), sqlPdCounters()]);
    return { counters, sheets };
  }
  return readDB();
}

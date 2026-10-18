// Stock book store — same shared-storage pattern as the other modules, in its
// own JSON document, and now also in Cloudflare D1.
//
// --- Why there is a second store ------------------------------------------
//
// Because of what a save cost. Every piece in the book sat in one JSON
// document, read whole and written whole, so taking one piece into stock wrote
// every entry in the book. Measured on this machine, with an entry of the
// book's real shape, reading the document, adding one entry and writing it back:
//
//     500 entries  0.36 MB  average  4.8 ms  worst  7.1 ms
//    1000 entries  0.73 MB  average  8.3 ms  worst 11.1 ms
//    3429 entries  2.51 MB  average 18.4 ms  worst 31.6 ms
//    6000 entries  4.40 MB  average 33.0 ms  worst 55.8 ms
//
// A request on Cloudflare's free plan gets ten thousandths of a second of
// processor time. The book holds 3,429 entries, so taking a piece into stock
// was already over the whole allowance before the request did anything else,
// and it got worse every week. Nothing was being wasted. The cost was the
// document.
//
// In D1 a save is one row, and a row costs the same at six thousand entries as
// at five hundred.
//
// --- Which store is used ---------------------------------------------------
//
// D1, if and only if the database is attached to the Worker AND the entries
// have been copied into it. Otherwise the JSON document in R2, exactly as
// before, every line of which is still here and untouched.
//
// There is no half-way: the copy sets one flag when every entry is across, and
// that flag is the switch. So this can be deployed before the database exists,
// and the database can be filled before or after the deploy, and neither order
// leaves a window where the book reads as empty. That matters more here than
// anywhere: the R2 path reads, changes and writes whole, so a book misread as
// empty would put a blank document over every entry in it on the next save.
//
// Nothing is ever deleted from R2. After the switch the document stays as it
// was on the day of the move, a complete readable copy of every entry up to
// that moment.
import "server-only";
import { isDbConfigured, readDoc, writeDoc } from "./db";
import {
  BLANK_LINE, hasContent, searchStock, stockRowOf, suggestCode,
  type NewStockEntry, type StockEntry, type StockLine, type StockRow,
} from "./stockBookConfig";
import { hasSql } from "./sql";
import { stockBookIsInSql } from "./sqlSchema";
import { numberTemplate } from "./sqlRecords";
import {
  sqlCreateStockEntry,
  sqlDeleteStockEntry,
  sqlGetStockEntry,
  sqlListStockEntries,
  sqlPutStockEntry,
  sqlStockCount,
  sqlStockCounter,
  sqlStockLocations,
  sqlStockPage,
} from "./stockBookSql";
import { loadPrices } from "./priceStore";
import { getJangadRows, jangadStockLines } from "./jangadStore";
import {
  traceDesign, type DesignTrace,
} from "./designTrace";
import { joinDesignNo } from "./designNo";
import { todayInput } from "./memoFormat";

const DB_PATH = "stockbook/db.json";

export type StockBookDB = { entries: StockEntry[]; seq: number };

export function isStockBookConfigured(): boolean {
  return isDbConfigured();
}

// Is D1 where the book lives?
//
// Both halves have to be true: the database has to be attached, and the entries
// have to be in it. Asked on every call rather than worked out once, because
// the day the copy runs is a day when the answer changes without a deploy.
async function useSql(): Promise<boolean> {
  return hasSql() && (await stockBookIsInSql());
}

async function readDB(): Promise<StockBookDB> {
  const db = await readDoc<Partial<StockBookDB>>(DB_PATH, {});
  return { entries: db.entries || [], seq: db.seq || 0 };
}

// The document as it really is, for the copy into D1. readDB() fills in the
// defaults, which is right everywhere it is used and would quietly invent an
// empty book out of a document that could not be read.
export async function readStockBookDoc(): Promise<Partial<StockBookDB>> {
  return readDoc<Partial<StockBookDB>>(DB_PATH, {});
}

async function writeDB(db: StockBookDB): Promise<void> {
  await writeDoc(DB_PATH, db);
}

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function normalizeStockInput(body: Record<string, unknown>): NewStockEntry {
  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  const lines: StockLine[] = rawLines
    .map((raw) => {
      const l = raw as Partial<StockLine>;
      return {
        breakupWt: s(l.breakupWt), pcs: s(l.pcs), shape: s(l.shape),
        sieve: s(l.sieve), code: s(l.code),
      };
    })
    .filter(hasContent);

  return {
    stockNo: s(body.stockNo),
    date: s(body.date) || todayInput(),
    design: s(body.design),
    designNo: s(body.designNo),
    category: s(body.category),
    subCategory: s(body.subCategory),
    subSubCategory: s(body.subSubCategory),
    location: s(body.location),
    goldDetails: s(body.goldDetails),
    inchSize: s(body.inchSize),
    grossWt: s(body.grossWt),
    netWt: s(body.netWt),
    partyName: s(body.partyName),
    polkiLabour: body.polkiLabour === true,
    lines: lines.length ? lines : [{ ...BLANK_LINE }],
    comments: s(body.comments),
    jangadIds: Array.isArray(body.jangadIds)
      ? body.jangadIds.filter((x): x is string => typeof x === "string")
      : undefined,
    pdId: s(body.pdId) || undefined,
    pdNo: s(body.pdNo) || undefined,
    demandNos: strList(body.demandNos),
    memoNos: strList(body.memoNos),
    mfgName: s(body.mfgName) || undefined,
  };
}

const strList = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;

export async function listStockEntries(): Promise<StockEntry[]> {
  // The database sorts it, by the same two keys and to the same order.
  if (await useSql()) return sqlListStockEntries();

  const db = await readDB();
  return db.entries.slice().sort((a, b) =>
    a.createdAt === b.createdAt
      ? a.stockNo.localeCompare(b.stockNo, undefined, { numeric: true })
      : a.createdAt < b.createdAt ? 1 : -1
  );
}

// --- One page of the book -----------------------------------------------------
//
// How many entries the page may carry at once.
//
// Measured on this machine, serialising the sixteen-field rows the table reads
// into a page: 400 rows costs 0.20 MB and under a millisecond, 1,000 rows
// 0.50 MB and about 2 at worst, and the whole book of 3,429 entries 1.73 MB and
// between 6 and 9. A request on this plan gets 10 milliseconds of processor
// time for everything it does, and React's own serialisation costs more than
// the plain measurement. 400 entries leaves the rest of the request its
// allowance, and it is also what /jangad opens on, so the two pages behave the
// same way and the office only has one thing to learn.
export const STOCK_PAGE = 400;

// And how many a filter may bring back. A search, a date range or a place is
// somebody looking for something, so it is worth more of the allowance than the
// opening page is; past this the answer is to narrow the filter rather than to
// read further.
export const STOCK_MATCHES = 1000;

export type StockFilters = {
  q?: string;
  from?: string;
  to?: string;
  location?: string;
};

export type StockBookPage = {
  rows: StockRow[];
  // Every place the book has ever held stock in, for the filter. Not gathered
  // from `rows` any more: a page of 400 entries does not mention every place
  // somebody may want to filter by.
  locations: string[];
  // How many pieces the whole book holds. The page can no longer count them for
  // itself, and the foot of that page is where the office reads how big the
  // book is, so it is counted here: one statement, and free on the other path
  // because the document has been read anyway.
  total: number;
  // The cap that was in force, and whether it cut the list short. The page says
  // so on screen rather than quietly showing part of the book.
  cap: number;
  more: boolean;
  filtered: boolean;
};

// The rows the stock book page is showing, and nothing else.
//
// The database narrows by date, place and a plain LIKE, and hands back
// candidates; the design-number matching that decides which entries a phrase
// really names is done here, over those candidates, by the same searchStock()
// the page itself uses. See sqlStockPage() for why it is split that way.
//
// On the R2 path the whole document is still read, because a document can only
// be read whole, and the narrowing happens in memory afterwards. That path runs
// only until the book has been copied into the database, and it has to give the
// same answers while it does.
export async function listStockPage(filters: StockFilters = {}): Promise<StockBookPage> {
  const q = (filters.q || "").trim();
  const from = (filters.from || "").trim();
  const to = (filters.to || "").trim();
  const location = (filters.location || "").trim();
  const filtered = !!(q || from || to || location);
  const cap = filtered ? STOCK_MATCHES : STOCK_PAGE;

  let candidates: StockRow[];
  let locations: string[];
  let total: number;
  // True when the database had more candidates than were looked at, so an entry
  // beyond the cap may have matched and gone unseen. Honest either way: what
  // the screen says is that there are more than it is showing.
  let cut = false;

  if (await useSql()) {
    [candidates, locations, total] = await Promise.all([
      sqlStockPage({ q, from, to, location }, cap + 1),
      sqlStockLocations(),
      sqlStockCount(),
    ]);
    cut = candidates.length > cap;
  } else {
    const all = await listStockEntries();
    total = all.length;
    locations = [...new Set(all.map((e) => e.location).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    // Dates are stored as yyyy-mm-dd, which compares correctly as text. An
    // entry with no date is outside every range rather than inside the open end
    // of one, exactly as the book has always read it.
    candidates = all
      .filter(
        (e) =>
          (!from || (e.date && e.date >= from)) &&
          (!to || (e.date && e.date <= to)) &&
          (!location || e.location === location)
      )
      .map(stockRowOf);
  }

  const matched = searchStock(candidates, q);
  return {
    rows: matched.slice(0, cap),
    locations,
    total,
    cap,
    more: cut || matched.length > cap,
    filtered,
  };
}

export async function getStockEntry(id: string): Promise<StockEntry | null> {
  if (await useSql()) return sqlGetStockEntry(id);

  const db = await readDB();
  return db.entries.find((e) => e.id === id) || null;
}

// Stock numbers run S0001, S0002 … The book keeps its own counter rather than
// counting rows, so deleting an entry never hands its number to the next piece.
export function stockNoFor(seq: number): string {
  return `S${String(seq).padStart(4, "0")}`;
}

// And the entry's own id, which is this portal's rather than the office's:
// nobody types it, and it is the address of the entry's page.
export function stockIdFor(seq: number): string {
  return `SB-${String(seq).padStart(5, "0")}`;
}

export async function nextStockNo(): Promise<string> {
  // A preview, not a number taken. If somebody else saves first this was a
  // guess, and the number on the saved entry is the right one.
  if (await useSql()) return stockNoFor((await sqlStockCounter()) + 1);

  // The new-entry form asks for this before anything is saved, so an
  // unconfigured portal shows S0001 rather than an error on a blank form.
  if (!isDbConfigured()) return stockNoFor(1);
  const db = await readDB();
  return stockNoFor(db.seq + 1);
}

export async function createStockEntry(input: NewStockEntry): Promise<StockEntry> {
  // In the database the number is raised and used inside one transaction, so
  // two pieces taken into stock in the same moment become S0410 and S0411 and
  // never both S0410. Against the document it still is what it always was: the
  // whole book read in, the counter raised, the whole book written back.
  const entry = (await useSql())
    ? await createInSql(input)
    : await createInDoc(input);

  // The jangad register asks for a Stock Code on every line of the piece; this
  // is where that code comes from, so it is written back rather than copied
  // across by hand. Best-effort: the stock entry is saved either way.
  if (entry.jangadIds?.length) {
    await stampJangadStockCode(entry.jangadIds, entry.stockNo).catch(() => {});
  }
  return entry;
}

// The entry into the database, under the next number in the book. The id and
// the stock number are left blank here because only the database knows what
// they are; a number typed by hand is carried through as it stands and wins.
// See sqlCreateStockEntry().
async function createInSql(input: NewStockEntry): Promise<StockEntry> {
  const now = new Date().toISOString();
  return sqlCreateStockEntry(
    { ...input, id: "", createdAt: now, updatedAt: now },
    {
      id: numberTemplate(stockIdFor),
      no: numberTemplate(stockNoFor),
    }
  );
}

// The entry into the JSON document, which is what runs until the book has been
// copied across. Unchanged: the book is read, the next number comes off the
// document's own counter, and the book is written back.
async function createInDoc(input: NewStockEntry): Promise<StockEntry> {
  const db = await readDB();
  db.seq += 1;
  const now = new Date().toISOString();
  const entry: StockEntry = {
    ...input,
    // A number typed by hand wins — pieces come in from elsewhere with numbers
    // already on them — but the counter still moves, so the next one is free.
    stockNo: input.stockNo || stockNoFor(db.seq),
    id: stockIdFor(db.seq),
    createdAt: now,
    updatedAt: now,
  };
  db.entries.push(entry);
  await writeDB(db);
  return entry;
}

export async function updateStockEntry(
  id: string,
  patch: NewStockEntry
): Promise<StockEntry | null> {
  // One entry read and one entry written, rather than the book twice. The read
  // is needed and cannot be done in the database: an edit keeps the identity
  // fields and keeps the links the form does not carry, so the entry as it
  // stands has to be in hand to merge onto.
  if (await useSql()) {
    const before = await sqlGetStockEntry(id);
    if (!before) return null;
    const updated = merged(before, patch);
    await sqlPutStockEntry(updated);
    return updated;
  }

  const db = await readDB();
  const idx = db.entries.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  const updated = merged(db.entries[idx], patch);
  db.entries[idx] = updated;
  await writeDB(db);
  return updated;
}

// An edit onto the entry as it stands. The identity fields (id, createdAt) are
// preserved because the patch does not carry them.
function merged(before: StockEntry, patch: NewStockEntry): StockEntry {
  return {
    ...before,
    ...patch,
    stockNo: patch.stockNo || before.stockNo,
    // Where the piece came from is not on the form, so an edit that does not
    // carry the link keeps the one the entry already had rather than cutting
    // the stock number loose from its jangad entries.
    jangadIds: patch.jangadIds ?? before.jangadIds,
    pdId: patch.pdId ?? before.pdId,
    pdNo: patch.pdNo ?? before.pdNo,
    demandNos: patch.demandNos ?? before.demandNos,
    memoNos: patch.memoNos ?? before.memoNos,
    mfgName: patch.mfgName ?? before.mfgName,
    updatedAt: new Date().toISOString(),
  };
}

export async function deleteStockEntry(id: string): Promise<boolean> {
  // The entry is read before it is removed, and not only to answer "was there
  // one": the Stock Code stamped on its jangad lines has to be taken off, and
  // which lines those are is recorded on the entry itself.
  const gone = await removeEntry(id);
  if (!gone) return false;

  // The Stock Code stamped on the jangad lines is what keeps the piece from
  // being offered again, so removing the entry has to take the stamp off with
  // it — otherwise an entry made by mistake locks the piece out for good.
  if (gone.jangadIds?.length) {
    await stampJangadStockCode(gone.jangadIds, "", gone.stockNo).catch(() => {});
  }
  return true;
}

// The entry out of whichever store holds it, handed back so the stamp it left
// on the register can be cleared. Null when there was no such entry.
//
// From the database that is one row read and one row deleted. From the document
// it is the book read once and written once, as it always was: the entry has to
// be found in the book that is being rewritten anyway, so reading it first
// through getStockEntry() would be reading the whole document twice.
async function removeEntry(id: string): Promise<StockEntry | null> {
  if (await useSql()) {
    const gone = await sqlGetStockEntry(id);
    if (!gone) return null;
    return (await sqlDeleteStockEntry(id)) ? gone : null;
  }

  const db = await readDB();
  const gone = db.entries.find((e) => e.id === id);
  if (!gone) return null;
  db.entries = db.entries.filter((e) => e.id !== id);
  await writeDB(db);
  return gone;
}

// For the nightly backup.
//
// The running number goes with the entries, as it always has: a restore that
// brought the entries back without it would start the book again at S0001 and
// write second entries under numbers that are already on pieces.
export async function exportStockBookDb(): Promise<StockBookDB> {
  if (await useSql()) {
    const [entries, seq] = await Promise.all([
      sqlListStockEntries(),
      sqlStockCounter(),
    ]);
    return { entries, seq };
  }
  return readDB();
}

// --- Taking a piece in from the jangad register ------------------------------

export type StockSeedPiece = {
  key: string; // design + piece, how the register writes it
  pieceNo: string;
  designNo: string;
  subDesignNo: string;
  product: string;
  mfgName: string;
  stockCode: string; // already in stock if this is filled
  jangadIds: string[];
  pdId?: string;
  pdNo?: string;
  // Everything the design number already knows, so the entry starts filled in
  // rather than blank.
  trace: DesignTrace | null;
  lines: StockLine[];
};

// Every piece the register knows about, with its diamond lines gathered into
// the shape a stock entry wants. What came back studded is what is now in the
// jewellery, so the used figures are the ones carried across — not what went
// out, some of which came back loose.
// The register is asked for the fourteen fields this uses rather than for its
// rows: everything else in a register row was parsed out of the stored record
// and thrown away, one JSON.parse per entry on a page that only lists pieces.
export async function piecesForStock(): Promise<StockSeedPiece[]> {
  const [rows, prices] = await Promise.all([jangadStockLines(), loadPrices()]);
  const byPiece = new Map<string, StockSeedPiece>();

  for (const r of rows) {
    const pieceNo = joinDesignNo(r.designNo, r.subDesignNo, "");
    if (!pieceNo) continue;
    const key = pieceNo.toUpperCase();
    let p = byPiece.get(key);
    if (!p) {
      p = {
        key, pieceNo, designNo: r.designNo, subDesignNo: r.subDesignNo,
        product: r.product, mfgName: r.mfgName, stockCode: r.stockCode,
        // Left off rather than blank when the entry has no PD sheet behind it,
        // which is the shape the form and the saved entry both expect.
        jangadIds: [], pdId: r.pdId || undefined, pdNo: r.pdNo || undefined,
        trace: null,
        lines: [],
      };
      byPiece.set(key, p);
    }
    p.jangadIds.push(r.id);
    if (r.stockCode && !p.stockCode) p.stockCode = r.stockCode;
    if (!p.product && r.product) p.product = r.product;

    const line: StockLine = {
      // What was studded, which is what is in the piece now.
      breakupWt: r.ctsUsed || r.carats,
      pcs: r.pcsUsed || r.pcs,
      shape: r.shape,
      sieve: r.size,
      code: "",
    };
    line.code = suggestCode(prices, line);
    if (hasContent(line)) p.lines.push(line);
  }

  // No traces here, deliberately.
  //
  // A trace walks the PD book, the demand book and the register for one design
  // number. This list used to trace every piece the register has ever held, so
  // opening the page cost a trace per piece — and the page it feeds shows the
  // piece number, the product, the factory and how many stone sizes it has,
  // none of which comes from a trace. The one piece somebody actually picks is
  // traced then, through the same lookup the design-number box already uses.
  const list = [...byPiece.values()];

  return list.sort((a, b) =>
    a.pieceNo.localeCompare(b.pieceNo, undefined, { numeric: true })
  );
}

// A piece that never went through the register — anything made before the
// portal, or a repair coming back — still has a design number, and the number
// still knows most of the entry.
export async function seedFromDesign(query: string): Promise<StockSeedPiece | null> {
  const trace = await traceDesign(query);
  if (!trace) return null;
  const known = await piecesForStock().catch(() => [] as StockSeedPiece[]);
  const already = known.find(
    (p) => p.pieceNo.toUpperCase() === trace.pieceNo.toUpperCase()
  );
  // The register's own figures, with the trace that was just worked out for
  // this one number put back on them.
  if (already) return { ...already, trace };
  return {
    key: trace.pieceNo.toUpperCase(),
    pieceNo: trace.pieceNo,
    designNo: trace.designNo,
    subDesignNo: "",
    product: trace.product,
    mfgName: trace.mfgName,
    stockCode: "",
    jangadIds: [],
    pdId: trace.pdId,
    pdNo: trace.pdNo,
    trace,
    lines: [],
  };
}

// Writes the stock number into the Stock Code column of every jangad line for
// the piece — the register's own record of when it left the workshop.
//
// `only` clears the stamp rather than setting one: it names the number being
// taken off, so a line already carrying a different stock number — a piece
// entered again by hand, say — is left exactly as it is.
async function stampJangadStockCode(
  ids: string[],
  stockNo: string,
  only?: string
): Promise<void> {
  const rows = await getJangadRows(ids);
  const wanted = only === undefined ? rows : rows.filter((r) => r.stockCode === only);
  if (!wanted.length) return;
  const { updateJangadRows } = await import("./jangadStore");
  await updateJangadRows(
    wanted.map((r) => ({ id: r.id, row: { ...r, stockCode: stockNo } }))
  );
}

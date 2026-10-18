// The tables, and what each column is for.
//
// The shape here is chosen to be the smallest change that can possibly work,
// because this is the owner's live business ledger and a clever schema that
// loses a field is worse than a dull one that keeps every record whole.
//
// So every table has two kinds of column:
//
//   * the fields a list page sorts, filters or searches on, as real columns;
//   * `doc`, the entire record as JSON, exactly as it sits in the R2 document
//     today.
//
// A list page selects the small columns and never reads `doc`. Opening one
// record selects its `doc` and gets back precisely the object the TypeScript
// types already describe, so nothing above this layer has to change and no
// field can be quietly dropped on the way through. A field added to a memo next
// year keeps working without a schema change; it is in `doc` either way, and it
// only needs a column of its own if a list page starts filtering on it.
//
// The column lists below are the single description of each table. The
// CREATE TABLE statement, the INSERT a save uses, and the SELECT that copies
// records out of R2 are all generated from them, so there is no second list to
// keep in step.
import "server-only";
import { isMissingTable, sqlFirst, sqlRun } from "./sql";
import type { Party, StockEvent } from "./memoFormat";
import type { Memo, Order } from "./memoStore";
import type { JangadRow } from "./jangadConfig";
import type { PdSheet } from "./pdStore";
import type { Demand } from "./demandStore";
import { piecesInStock, stockedPieces } from "./designNo";
import { demandDesigns, demandSearchRest, totalPcs } from "./demandConfig";

// One real column: its name, its type, where to find its value in a record in
// hand, and where to find it inside a stored JSON record.
export type SqlColumn<T> = {
  name: string;
  type: "TEXT" | "INTEGER" | "REAL";
  // The field's SQLite JSON path inside the stored record. Used by the copy,
  // which expands whole records inside the database rather than one query per
  // record.
  //
  // Left out by a column that holds something worked out from a record rather
  // than a field of it: the demand list's prepared search text, the count of a
  // PD sheet's pieces that reached the stock book. There is no path to those,
  // so the copy for those two tables works every column out here and hands the
  // database a flattened record. See insertFlatRows() in sqlRecords.ts.
  path?: string;
  // The same value taken from a record already in memory. Used by every save.
  get: (record: T) => unknown;
  // What a record that has not got this field at all becomes. Older memos have
  // no kind and no gold rows; every column is NOT NULL and carries a blank
  // rather than a null, so nothing downstream has to test for both.
  blank: string | number;
  primaryKey?: boolean;
};

const text = (value: unknown): string => (value === undefined || value === null ? "" : String(value));
const num = (value: unknown): number => (typeof value === "number" && isFinite(value) ? value : 0);
const json = (value: unknown): string => JSON.stringify(value ?? []);

// --- Memos -------------------------------------------------------------------
//
// Why each real column is real:
//
//   id             the row's identity, and the address of its page (/memo/ID).
//   memo_no        the first column of the history, and searched.
//   kind           the Jewellery / Gold tabs filter on it, and the counts beside
//                  each tab are counts of it.
//   fy, seq        the number the memo was issued under. Separate columns
//                  because the two books are counted and audited per year.
//   to_party       the "To" column, and its own filter dropdown. Named
//                  to_party because TO is a reserved word in SQL.
//   through,
//   mobile         both searched by the box above the history.
//   memo_date      the Date column, and the From / Until filters.
//   purpose        the Purpose column and its filter.
//   comment        not on the history. It is a column so that the history's
//                  rebuilt memo is the whole memo and not a memo with one
//                  field silently missing.
//   against_memo_no  searched; it is how a receipt is tied to its issue.
//   total_pcs,
//   total_gross_wt,
//   total_fine_wt  the Qty column, which shows pieces for a jewellery memo and
//                  fine grams for a gold one.
//   created_at     the sort order of the history, newest first. Indexed.
//   updated_at     what the nightly backup uses to decide whether a memo's PDF
//                  needs fetching again.
//   items          the jewellery rows. The history needs them for two things it
//                  works out in the browser: the status pill, and the search
//                  box matching a stock number. They are their own column so
//                  the list can have them without reading `doc`.
//   gold_items     the same, for searching a gold description.
export const MEMO_COLUMNS: SqlColumn<Memo>[] = [
  { name: "id", type: "TEXT", path: "$.id", get: (m) => m.id, blank: "", primaryKey: true },
  { name: "memo_no", type: "TEXT", path: "$.memoNo", get: (m) => text(m.memoNo), blank: "" },
  // A memo written before gold existed has no kind and is a jewellery memo,
  // which is the same reading normalize() has always given it.
  { name: "kind", type: "TEXT", path: "$.kind", get: (m) => (m.kind === "gold" ? "gold" : "jewellery"), blank: "jewellery" },
  { name: "fy", type: "TEXT", path: "$.fy", get: (m) => text(m.fy), blank: "" },
  { name: "seq", type: "INTEGER", path: "$.seq", get: (m) => num(m.seq), blank: 0 },
  { name: "to_party", type: "TEXT", path: "$.to", get: (m) => text(m.to), blank: "" },
  { name: "through", type: "TEXT", path: "$.through", get: (m) => text(m.through), blank: "" },
  { name: "mobile", type: "TEXT", path: "$.mobile", get: (m) => text(m.mobile), blank: "" },
  { name: "memo_date", type: "TEXT", path: "$.date", get: (m) => text(m.date), blank: "" },
  { name: "purpose", type: "TEXT", path: "$.purpose", get: (m) => text(m.purpose), blank: "" },
  { name: "comment", type: "TEXT", path: "$.comment", get: (m) => text(m.comment), blank: "" },
  { name: "against_memo_no", type: "TEXT", path: "$.againstMemoNo", get: (m) => text(m.againstMemoNo), blank: "" },
  { name: "total_pcs", type: "INTEGER", path: "$.totalPcs", get: (m) => num(m.totalPcs), blank: 0 },
  { name: "total_gross_wt", type: "REAL", path: "$.totalGrossWt", get: (m) => num(m.totalGrossWt), blank: 0 },
  { name: "total_fine_wt", type: "REAL", path: "$.totalFineWt", get: (m) => num(m.totalFineWt), blank: 0 },
  { name: "created_at", type: "TEXT", path: "$.createdAt", get: (m) => text(m.createdAt), blank: "" },
  { name: "updated_at", type: "TEXT", path: "$.updatedAt", get: (m) => text(m.updatedAt), blank: "" },
  { name: "items", type: "TEXT", path: "$.items", get: (m) => json(m.items), blank: "[]" },
  { name: "gold_items", type: "TEXT", path: "$.goldItems", get: (m) => json(m.goldItems), blank: "[]" },
];

// --- Stock events ------------------------------------------------------------
//
// What became of each piece on a memo, append-only. These are read two ways and
// both are a column: every event for one memo (the memo's own page), and every
// event for one stock number (the ledger for that piece). The whole event is
// rebuilt from `doc`, which is both faithful and no more work than rebuilding
// it from the columns would be.
export const EVENT_COLUMNS: SqlColumn<StockEvent>[] = [
  { name: "id", type: "TEXT", path: "$.id", get: (e) => e.id, blank: "", primaryKey: true },
  { name: "memo_id", type: "TEXT", path: "$.memoId", get: (e) => text(e.memoId), blank: "" },
  { name: "stock_no", type: "TEXT", path: "$.stockNo", get: (e) => text(e.stockNo), blank: "" },
  // The recording time orders two events about the same piece, so a correction
  // keyed in later wins over the mistake it corrects.
  { name: "recorded_at", type: "TEXT", path: "$.at", get: (e) => text(e.at), blank: "" },
];

// --- Orders ------------------------------------------------------------------
//
// The order board shows every open order newest first, and the whole row is
// shown rather than filtered on, so the only columns that earn their place are
// the identity, the number it was taken under, the sort, and the status the
// board groups by.
export const ORDER_COLUMNS: SqlColumn<Order>[] = [
  { name: "id", type: "TEXT", path: "$.id", get: (o) => o.id, blank: "", primaryKey: true },
  { name: "order_no", type: "TEXT", path: "$.orderNo", get: (o) => text(o.orderNo), blank: "" },
  // ORD/26-27/004 is counted per fiscal year in its own book, exactly as a
  // memo is, and takes its number the same way.
  { name: "fy", type: "TEXT", path: "$.fy", get: (o) => text(o.fy), blank: "" },
  { name: "seq", type: "INTEGER", path: "$.seq", get: (o) => num(o.seq), blank: 0 },
  { name: "status", type: "TEXT", path: "$.status", get: (o) => text(o.status), blank: "in_production" },
  { name: "created_at", type: "TEXT", path: "$.createdAt", get: (o) => text(o.createdAt), blank: "" },
  { name: "updated_at", type: "TEXT", path: "$.updatedAt", get: (o) => text(o.updatedAt), blank: "" },
];

// --- Parties -----------------------------------------------------------------
//
// The controlled lists: memo parties, manufacturers, categories and the rest.
// Every screen asks for one list at a time, alphabetically, so kind and name
// are columns and are indexed together. parent_id is a column because a
// sub-category is reached through the category above it.
//
// A party saved before kinds existed has none and is a memo party, which is the
// reading partyKindOf() has always given it.
export const PARTY_COLUMNS: SqlColumn<Party>[] = [
  { name: "id", type: "TEXT", path: "$.id", get: (p) => p.id, blank: "", primaryKey: true },
  { name: "name", type: "TEXT", path: "$.name", get: (p) => text(p.name), blank: "" },
  { name: "kind", type: "TEXT", path: "$.kind", get: (p) => text(p.kind) || "party", blank: "party" },
  { name: "parent_id", type: "TEXT", path: "$.parentId", get: (p) => text(p.parentId), blank: "" },
  { name: "code", type: "TEXT", path: "$.code", get: (p) => text(p.code), blank: "" },
];

// --- The jangad register -----------------------------------------------------
//
// The register is the largest thing in the portal and the one that grows
// fastest: one row per piece of jewellery per diamond size, 28 columns of typed
// text, thousands of rows and more every week. Saving one of them rewrote the
// whole register, which is why /jangad stopped working.
//
// Every column of the workbook is in `doc`, as always, so nothing above this
// layer loses a field. The real columns below are only the ones something
// actually asks the database for.
//
// Why each real column is real:
//
//   id             the row's identity, and the address a save goes to
//                  (/api/jangad/JG-04910). It is also the register's own
//                  serial, so it orders rows inside a batch.
//   jangad_date    the issue date: the From and Until filters above the
//                  register, and what the piece picker shows about an earlier
//                  issue. Named the long way for the same reason memo_date is:
//                  date() is one of SQLite's own functions, and a column of
//                  that name reads as a call to it.
//   design_no,
//   sub_design_no  the piece. The register keeps the design and the piece in
//                  separate columns and the search puts them back together, so
//                  both are needed to answer "which rows are this piece".
//   product        searched by the box above the register.
//   shape, size,
//   pcs            searched, and together they are the stone line as the piece
//                  picker reads it out: "ROUND +15.5-16 45 pcs". That label is
//                  how a second issue against the same piece is spotted before
//                  it is made, so the picker must be able to ask for these
//                  without reading every record whole.
//   certi_no       searched.
//   memo_no        searched, and shown by the picker beside the date.
//   mfg_name       its own filter dropdown, the list of factories that fills
//                  it, the search, and the picker.
//   status         searched.
//   stock_code     searched, and the stock book writes it back here when a
//                  finished piece is taken into stock.
//   run_no         the whole design run as the PD sheet writes it. No workbook
//                  column holds it, and it is searched, so it is the only way
//                  back from a run number to the pieces issued under it.
//   created_at     the register's order, newest batch first. Indexed.
//   updated_at     written on every save. A column rather than only a field in
//                  `doc` so "what has been touched since" can be asked of the
//                  register without reading the register.
export const JANGAD_ROW_COLUMNS: SqlColumn<JangadRow>[] = [
  { name: "id", type: "TEXT", path: "$.id", get: (r) => r.id, blank: "", primaryKey: true },
  { name: "jangad_date", type: "TEXT", path: "$.date", get: (r) => text(r.date), blank: "" },
  { name: "design_no", type: "TEXT", path: "$.designNo", get: (r) => text(r.designNo), blank: "" },
  { name: "sub_design_no", type: "TEXT", path: "$.subDesignNo", get: (r) => text(r.subDesignNo), blank: "" },
  { name: "product", type: "TEXT", path: "$.product", get: (r) => text(r.product), blank: "" },
  { name: "shape", type: "TEXT", path: "$.shape", get: (r) => text(r.shape), blank: "" },
  { name: "size", type: "TEXT", path: "$.size", get: (r) => text(r.size), blank: "" },
  // Pieces of stone, kept as the text it was typed as. Every figure in this
  // register is text on purpose: a half-typed weight has to survive being
  // typed, and the export converts on the way out.
  { name: "pcs", type: "TEXT", path: "$.pcs", get: (r) => text(r.pcs), blank: "" },
  { name: "certi_no", type: "TEXT", path: "$.certiNo", get: (r) => text(r.certiNo), blank: "" },
  { name: "memo_no", type: "TEXT", path: "$.memoNo", get: (r) => text(r.memoNo), blank: "" },
  { name: "mfg_name", type: "TEXT", path: "$.mfgName", get: (r) => text(r.mfgName), blank: "" },
  { name: "status", type: "TEXT", path: "$.status", get: (r) => text(r.status), blank: "" },
  { name: "stock_code", type: "TEXT", path: "$.stockCode", get: (r) => text(r.stockCode), blank: "" },
  { name: "run_no", type: "TEXT", path: "$.runNo", get: (r) => text(r.runNo), blank: "" },
  { name: "created_at", type: "TEXT", path: "$.createdAt", get: (r) => text(r.createdAt), blank: "" },
  { name: "updated_at", type: "TEXT", path: "$.updatedAt", get: (r) => text(r.updatedAt), blank: "" },
];

// --- Building the statements -------------------------------------------------

function createTable<T>(table: string, columns: SqlColumn<T>[]): string {
  const lines = columns.map((column) => {
    const constraint = column.primaryKey ? "PRIMARY KEY" : "NOT NULL";
    return `  ${column.name} ${column.type} ${constraint}`;
  });
  // Last, and never optional: the record itself.
  lines.push("  doc TEXT NOT NULL");
  return `CREATE TABLE IF NOT EXISTS ${table} (\n${lines.join(",\n")}\n)`;
}

// The column names an INSERT names, in order, with `doc` last.
export function columnNames<T>(columns: SqlColumn<T>[]): string[] {
  return [...columns.map((c) => c.name), "doc"];
}

// A record's values in that same order, with the record itself last.
export function columnValues<T>(columns: SqlColumn<T>[], record: T): unknown[] {
  return [...columns.map((c) => c.get(record)), JSON.stringify(record)];
}

export const MEMO_TABLE = "memos";
export const EVENT_TABLE = "memo_events";
export const ORDER_TABLE = "memo_orders";
export const PARTY_TABLE = "memo_parties";
export const COUNTER_TABLE = "memo_counters";
export const FLAG_TABLE = "memo_flags";

// Set to 1 by the copy, and only once every record is across. Until then the
// portal reads memos from R2 as it always has, so the two can be deployed in
// either order and there is no window where the memo book looks empty.
export const MEMOS_FILLED = "memos:filled";

// Every statement, in the order they have to run: tables before the indexes on
// them. Each is IF NOT EXISTS, so running the whole list again changes nothing
// and a run that stopped half way is finished by running it again.
export const MEMO_SCHEMA: string[] = [
  createTable(MEMO_TABLE, MEMO_COLUMNS),
  createTable(EVENT_TABLE, EVENT_COLUMNS),
  createTable(ORDER_TABLE, ORDER_COLUMNS),
  createTable(PARTY_TABLE, PARTY_COLUMNS),

  // The running numbers, one row per book: "26-27" for jewellery memos,
  // "G:26-27" for gold, "O:26-27" for orders. Exactly the key/value map the
  // JSON document holds today, which is what keeps SS/26-27/008 following
  // SS/26-27/007 after the move.
  `CREATE TABLE IF NOT EXISTS ${COUNTER_TABLE} (
  counter_key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
)`,

  // Things that have happened once and must not happen twice: the records
  // copied in, a built-in list written in. Separate from the counters so that
  // backing the counters up and restoring them cannot carry a flag with them.
  `CREATE TABLE IF NOT EXISTS ${FLAG_TABLE} (
  flag TEXT PRIMARY KEY,
  value INTEGER NOT NULL
)`,

  // The memo history's sort order. Newest first is how every list in the
  // portal reads, and it is the one index the history cannot do without.
  `CREATE INDEX IF NOT EXISTS idx_memos_created_at ON ${MEMO_TABLE} (created_at DESC)`,
  // The stock ledger walks memos in date order rather than entry order,
  // because what matters there is when goods moved.
  `CREATE INDEX IF NOT EXISTS idx_memos_memo_date ON ${MEMO_TABLE} (memo_date)`,
  // The issue memos a gold receipt can be booked against: one kind, one
  // purpose, newest first.
  `CREATE INDEX IF NOT EXISTS idx_memos_kind_purpose ON ${MEMO_TABLE} (kind, purpose, created_at DESC)`,
  // Who a memo went to: counting a party's memos before it may be removed,
  // and finding the typed names the free-text era left behind.
  `CREATE INDEX IF NOT EXISTS idx_memos_to_party ON ${MEMO_TABLE} (to_party)`,

  // One memo's outcomes, for its own page.
  `CREATE INDEX IF NOT EXISTS idx_events_memo_id ON ${EVENT_TABLE} (memo_id)`,
  // One piece's outcomes, for the stock ledger.
  `CREATE INDEX IF NOT EXISTS idx_events_stock_no ON ${EVENT_TABLE} (stock_no)`,

  // The order board, newest first.
  `CREATE INDEX IF NOT EXISTS idx_orders_created_at ON ${ORDER_TABLE} (created_at DESC)`,
  // One controlled list at a time, alphabetically, which is how every dropdown
  // in the portal asks for it.
  `CREATE INDEX IF NOT EXISTS idx_parties_kind_name ON ${PARTY_TABLE} (kind, name)`,
];

// Everything the statements above create, by name, so whether they have all
// been run can be asked in one query instead of fourteen.
const MEMO_OBJECTS = [
  MEMO_TABLE, EVENT_TABLE, ORDER_TABLE, PARTY_TABLE, COUNTER_TABLE, FLAG_TABLE,
  "idx_memos_created_at", "idx_memos_memo_date", "idx_memos_kind_purpose",
  "idx_memos_to_party", "idx_events_memo_id", "idx_events_stock_no",
  "idx_orders_created_at", "idx_parties_kind_name",
];

// Create what is missing. Safe to run as often as anyone presses the button.
//
// Asks first, in one query, whether there is anything to do, because the only
// other thing this request is for is copying records and those statements come
// out of the same allowance of fifty. On a database that is already set up this
// costs one query rather than fourteen.
//
// Then one statement at a time rather than as one batch. A batch would be a
// single transaction, which sounds safer, but these statements do not need it:
// every one of them is IF NOT EXISTS, so the only thing a half-finished run
// costs is pressing the button again. Running them plainly is the behaviour
// least likely to surprise.
export async function applyMemoSchema(): Promise<number> {
  const marks = MEMO_OBJECTS.map(() => "?").join(", ");
  const row = await sqlFirst<{ found: number }>(
    `SELECT COUNT(*) AS found FROM sqlite_master WHERE name IN (${marks})`,
    MEMO_OBJECTS
  );
  if (row && Number(row.found) === MEMO_OBJECTS.length) return 0;

  for (const statement of MEMO_SCHEMA) await sqlRun(statement);
  return MEMO_SCHEMA.length;
}

// Are the memo tables filled, and is D1 therefore the live store?
//
// Only the flag answers this. Counting rows would not: a database with the
// tables made but the records not yet copied holds zero memos, and zero memos
// is also what a brand new business looks like.
//
// Tables that do not exist yet mean the move has not started, which is an
// ordinary answer. Anything else, such as a database that cannot be reached or
// is refusing, is thrown, because reading that as "not moved yet" would send the
// next save to R2 while the office works from D1, and the records would quietly
// part company.
let filled = false;

export async function memosAreInSql(): Promise<boolean> {
  if (filled) return true;
  try {
    const row = await sqlFirst<{ value: number }>(
      `SELECT value FROM ${FLAG_TABLE} WHERE flag = ?`,
      [MEMOS_FILLED]
    );
    filled = !!row && Number(row.value) === 1;
    return filled;
  } catch (err) {
    if (isMissingTable(err)) return false;
    throw err;
  }
}

// --- The jangad register, separately -----------------------------------------
//
// The register has its own tables, its own serial and its own flag, and shares
// nothing with the memo tables above. That is deliberate. The two modules moved
// on different days, and the owner presses Copy for each of them when he is
// ready; a register that could only be moved after the memos, or a memo book
// whose counters a jangad restore could carry away, would tie two decisions
// together that have no reason to be tied.
export const JANGAD_TABLE = "jangad";
export const JANGAD_COUNTER_TABLE = "jangad_counters";
export const JANGAD_FLAG_TABLE = "jangad_flags";

// The register's one running number, under this key: JG-04910 is the 4,910th
// row ever entered, and the next row must be JG-04911 whichever store it is
// written to. The same key/value shape the memo counters use, because this is
// the same kind of fact.
export const JANGAD_SEQ = "jangad";

// Set to 1 by the copy, and only once every row is across. Until then the
// register is read from R2 exactly as it always has been.
export const JANGAD_FILLED = "jangad:filled";

export const JANGAD_SCHEMA: string[] = [
  createTable(JANGAD_TABLE, JANGAD_ROW_COLUMNS),

  `CREATE TABLE IF NOT EXISTS ${JANGAD_COUNTER_TABLE} (
  counter_key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
)`,

  `CREATE TABLE IF NOT EXISTS ${JANGAD_FLAG_TABLE} (
  flag TEXT PRIMARY KEY,
  value INTEGER NOT NULL
)`,

  // The register's own order: newest batch first. It is the only sort the
  // register has ever had and the one index it cannot do without.
  `CREATE INDEX IF NOT EXISTS idx_jangad_created_at ON ${JANGAD_TABLE} (created_at DESC)`,
];

const JANGAD_OBJECTS = [
  JANGAD_TABLE, JANGAD_COUNTER_TABLE, JANGAD_FLAG_TABLE, "idx_jangad_created_at",
];

// Create what is missing, exactly as applyMemoSchema() does and for the same
// reasons: one query to ask whether there is anything to do, because the rest
// of this request's fifty are wanted for copying rows, and then one statement
// at a time because every one of them is IF NOT EXISTS and a run that stopped
// half way is finished by pressing the button again.
export async function applyJangadSchema(): Promise<number> {
  const marks = JANGAD_OBJECTS.map(() => "?").join(", ");
  const row = await sqlFirst<{ found: number }>(
    `SELECT COUNT(*) AS found FROM sqlite_master WHERE name IN (${marks})`,
    JANGAD_OBJECTS
  );
  if (row && Number(row.found) === JANGAD_OBJECTS.length) return 0;

  for (const statement of JANGAD_SCHEMA) await sqlRun(statement);
  return JANGAD_SCHEMA.length;
}

// Is the register in D1, and is D1 therefore where a jangad row is saved?
//
// The same reasoning as memosAreInSql(), and it matters more here. Counting
// rows would not answer it: a database with the table made and the rows not yet
// copied holds no rows, and so does a register nobody has written in yet. Only
// the flag says the copy finished.
//
// A table that is not there yet means the move has not started, which is an
// ordinary answer. Anything else is thrown, because reading a database that is
// refusing as "not moved yet" would send the next save to R2 while the office
// reads D1, and the register would quietly split in two.
let jangadFilled = false;

export async function jangadIsInSql(): Promise<boolean> {
  if (jangadFilled) return true;
  try {
    const row = await sqlFirst<{ value: number }>(
      `SELECT value FROM ${JANGAD_FLAG_TABLE} WHERE flag = ?`,
      [JANGAD_FILLED]
    );
    jangadFilled = !!row && Number(row.value) === 1;
    return jangadFilled;
  } catch (err) {
    if (isMissingTable(err)) return false;
    throw err;
  }
}

// --- PD sheets ---------------------------------------------------------------
//
// The design sheets, and the heaviest remaining write in the portal. A sheet is
// a page of fields with a photo and a run of pieces on it, and every one of the
// twenty-odd saves a sheet sees in its life rewrote every sheet in the book.
// Marking one piece as being made cost the whole book; so did pointing a photo
// somewhere else.
//
// Why each real column is real:
//
//   id             the row's identity, and the address of its page (/pd/PD-26-27-001).
//   pd_no          the first column of the list, and searched.
//   fy, seq        the number the sheet was issued under. Separate columns
//                  because the book is counted per financial year, and because
//                  the number is taken by the database inside the transaction
//                  that writes the sheet.
//   sku            the design number: shown, searched, and the one field the
//                  design lookup reads. See sqlPdDesigns().
//   product,
//   assigned_to,
//   delivery_date,
//   quantity       the columns of the list.
//   created_by,
//   updated_by     shown beside them: who wrote the sheet and who last touched it.
//   category,
//   sub_category,
//   pd_merchandiser,
//   zone,
//   order_type,
//   dia_quality    searched by the box above the list, though not shown in it.
//   in_stock,
//   stocked        what the list says about the pieces. Worked out when the
//                  sheet is saved rather than stored as a field of it, because
//                  the pieces themselves are not what the list wants: a four
//                  hundred piece run is four hundred objects and the list shows
//                  a count and the few that carry a stock number. These two
//                  columns are what keeps the list from reading the pieces at
//                  all. The count is left as it was recorded and clamped to the
//                  run's length on the way out, exactly as the list has always
//                  clamped it.
//   created_at     the sort order of the list, newest first. Indexed.
//
// What is deliberately not a column: `pieces`. It is not stored authority. It
// is rebuilt from `sku` on every read by reconcilePieces(), so a column holding
// it could disagree with the design number it is supposed to follow. `doc`
// holds the sheet as stored and the rebuild happens on the way out, which is
// what the R2 path has always done.
export const PD_COLUMNS: SqlColumn<PdSheet>[] = [
  { name: "id", type: "TEXT", path: "$.id", get: (s) => s.id, blank: "", primaryKey: true },
  { name: "pd_no", type: "TEXT", path: "$.pdNo", get: (s) => text(s.pdNo), blank: "" },
  { name: "fy", type: "TEXT", path: "$.fy", get: (s) => text(s.fy), blank: "" },
  { name: "seq", type: "INTEGER", path: "$.seq", get: (s) => num(s.seq), blank: 0 },
  { name: "sku", type: "TEXT", path: "$.sku", get: (s) => text(s.sku), blank: "" },
  { name: "product", type: "TEXT", path: "$.product", get: (s) => text(s.product), blank: "" },
  { name: "assigned_to", type: "TEXT", path: "$.assignedTo", get: (s) => text(s.assignedTo), blank: "" },
  { name: "delivery_date", type: "TEXT", path: "$.deliveryDate", get: (s) => text(s.deliveryDate), blank: "" },
  { name: "quantity", type: "TEXT", path: "$.quantity", get: (s) => text(s.quantity), blank: "" },
  { name: "created_by", type: "TEXT", path: "$.createdBy", get: (s) => text(s.createdBy), blank: "" },
  { name: "updated_by", type: "TEXT", path: "$.updatedBy", get: (s) => text(s.updatedBy), blank: "" },
  { name: "category", type: "TEXT", path: "$.category", get: (s) => text(s.category), blank: "" },
  { name: "sub_category", type: "TEXT", path: "$.subCategory", get: (s) => text(s.subCategory), blank: "" },
  { name: "pd_merchandiser", type: "TEXT", path: "$.pdMerchandiser", get: (s) => text(s.pdMerchandiser), blank: "" },
  { name: "zone", type: "TEXT", path: "$.zone", get: (s) => text(s.zone), blank: "" },
  { name: "order_type", type: "TEXT", path: "$.orderType", get: (s) => text(s.orderType), blank: "" },
  { name: "dia_quality", type: "TEXT", path: "$.diaQuality", get: (s) => text(s.diaQuality), blank: "" },
  // Worked out from the pieces, so no path: see the note on SqlColumn.path.
  { name: "in_stock", type: "INTEGER", get: (s) => piecesInStock(s.pieces), blank: 0 },
  { name: "stocked", type: "TEXT", get: (s) => json(stockedPieces(s.pieces)), blank: "[]" },
  { name: "created_at", type: "TEXT", path: "$.createdAt", get: (s) => text(s.createdAt), blank: "" },
];

export const PD_TABLE = "pd_sheets";
export const PD_COUNTER_TABLE = "pd_counters";
export const PD_FLAG_TABLE = "pd_flags";

// Set to 1 by the copy, and only once every sheet is across. Until then the
// portal reads the sheets from R2 exactly as it always has.
export const PD_FILLED = "pd:filled";

export const PD_SCHEMA: string[] = [
  createTable(PD_TABLE, PD_COLUMNS),

  // One row per financial year: "26-27" holds the serial PD/26-27/012 was the
  // twelfth of. Exactly the key/value map the JSON document's `counters` holds
  // today, which is what keeps PD/26-27/013 following it after the move.
  `CREATE TABLE IF NOT EXISTS ${PD_COUNTER_TABLE} (
  counter_key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
)`,

  `CREATE TABLE IF NOT EXISTS ${PD_FLAG_TABLE} (
  flag TEXT PRIMARY KEY,
  value INTEGER NOT NULL
)`,

  // The list's own order: newest sheet first. It is the only sort the list has
  // ever had and the one index it cannot do without.
  `CREATE INDEX IF NOT EXISTS idx_pd_created_at ON ${PD_TABLE} (created_at DESC)`,
];

const PD_OBJECTS = [PD_TABLE, PD_COUNTER_TABLE, PD_FLAG_TABLE, "idx_pd_created_at"];

// Create what is missing, exactly as the two above do and for the same reasons:
// one query to ask whether there is anything to do, because the rest of this
// request's fifty are wanted for copying sheets, and then one statement at a
// time because every one of them is IF NOT EXISTS and a run that stopped half
// way is finished by pressing the button again.
export async function applyPdSchema(): Promise<number> {
  const marks = PD_OBJECTS.map(() => "?").join(", ");
  const row = await sqlFirst<{ found: number }>(
    `SELECT COUNT(*) AS found FROM sqlite_master WHERE name IN (${marks})`,
    PD_OBJECTS
  );
  if (row && Number(row.found) === PD_OBJECTS.length) return 0;

  for (const statement of PD_SCHEMA) await sqlRun(statement);
  return PD_SCHEMA.length;
}

// Are the PD sheets in D1, and is D1 therefore where a sheet is saved?
//
// The same reasoning as memosAreInSql() and jangadIsInSql(). Counting rows
// would not answer it: a database with the table made and the sheets not yet
// copied holds none, and so does a book nobody has written in. Only the flag
// says the copy finished.
//
// A table that is not there yet means the move has not started, which is an
// ordinary answer. Anything else is thrown, because reading a database that is
// refusing as "not moved yet" would send the next save to R2 while the office
// reads D1, and the book would quietly split in two.
let pdFilled = false;

export async function pdIsInSql(): Promise<boolean> {
  if (pdFilled) return true;
  try {
    const row = await sqlFirst<{ value: number }>(
      `SELECT value FROM ${PD_FLAG_TABLE} WHERE flag = ?`,
      [PD_FILLED]
    );
    pdFilled = !!row && Number(row.value) === 1;
    return pdFilled;
  } catch (err) {
    if (isMissingTable(err)) return false;
    throw err;
  }
}

// --- Diamond demands ---------------------------------------------------------
//
// The smallest of the four and the simplest. A demand is a short header and one
// row per diamond size, and saving one rewrote every demand in the book.
//
// Why each real column is real:
//
//   id             the row's identity, and the address of its page.
//   demand_no      the first column of the list, and searched.
//   fy, seq        the number the demand was issued under, for the same two
//                  reasons the PD sheet keeps them.
//   demand_date    the Date column. Named the long way because date() is one of
//                  SQLite's own functions and a column of that name reads as a
//                  call to it, which is why memo_date and jangad_date are
//                  named as they are.
//   designs,
//   pcs,
//   search         the rest of what the list shows and searches on. All three
//                  are worked out from `rows` when the demand is saved rather
//                  than stored as fields of it, and that is the whole point of
//                  them: `rows` is nearly the entire demand, so a list that
//                  read the rows to work these out would be reading the demands
//                  whole. These three columns are a few dozen bytes each and
//                  they are everything the list wants.
//
//                  `search` holds everything searchable except the demand's own
//                  number, because when a demand is saved here the number is
//                  issued by the database inside the transaction that writes
//                  the row, so there is no number yet to put in it. The list
//                  puts it back from demand_no, which it is reading anyway. See
//                  demandSearchRest() and sqlDemandRows().
//   created_at     the sort order of the list, newest first. Indexed.
//
// Everything else a demand carries, the notes, who it went to, its PD link and
// the rows themselves with their comments and bag counts, is in `doc` and is
// read only when one demand is opened.
export const DEMAND_COLUMNS: SqlColumn<Demand>[] = [
  { name: "id", type: "TEXT", path: "$.id", get: (d) => d.id, blank: "", primaryKey: true },
  { name: "demand_no", type: "TEXT", path: "$.demandNo", get: (d) => text(d.demandNo), blank: "" },
  { name: "fy", type: "TEXT", path: "$.fy", get: (d) => text(d.fy), blank: "" },
  { name: "seq", type: "INTEGER", path: "$.seq", get: (d) => num(d.seq), blank: 0 },
  { name: "demand_date", type: "TEXT", path: "$.date", get: (d) => text(d.date), blank: "" },
  // The three worked-out columns, so no path: see the note on SqlColumn.path.
  { name: "designs", type: "TEXT", get: (d) => json(demandDesigns(d)), blank: "[]" },
  { name: "pcs", type: "INTEGER", get: (d) => num(totalPcs(d.rows || [])), blank: 0 },
  { name: "search", type: "TEXT", get: (d) => text(demandSearchRest(d)), blank: "" },
  { name: "created_at", type: "TEXT", path: "$.createdAt", get: (d) => text(d.createdAt), blank: "" },
];

export const DEMAND_TABLE = "demands";
export const DEMAND_COUNTER_TABLE = "demand_counters";
export const DEMAND_FLAG_TABLE = "demand_flags";

// Set to 1 by the copy, and only once every demand is across.
export const DEMANDS_FILLED = "demands:filled";

export const DEMAND_SCHEMA: string[] = [
  createTable(DEMAND_TABLE, DEMAND_COLUMNS),

  // One row per financial year, as the PD counters are, holding the serial
  // DD/26-27/004 was the fourth of.
  `CREATE TABLE IF NOT EXISTS ${DEMAND_COUNTER_TABLE} (
  counter_key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
)`,

  `CREATE TABLE IF NOT EXISTS ${DEMAND_FLAG_TABLE} (
  flag TEXT PRIMARY KEY,
  value INTEGER NOT NULL
)`,

  `CREATE INDEX IF NOT EXISTS idx_demands_created_at ON ${DEMAND_TABLE} (created_at DESC)`,
];

const DEMAND_OBJECTS = [
  DEMAND_TABLE, DEMAND_COUNTER_TABLE, DEMAND_FLAG_TABLE, "idx_demands_created_at",
];

export async function applyDemandSchema(): Promise<number> {
  const marks = DEMAND_OBJECTS.map(() => "?").join(", ");
  const row = await sqlFirst<{ found: number }>(
    `SELECT COUNT(*) AS found FROM sqlite_master WHERE name IN (${marks})`,
    DEMAND_OBJECTS
  );
  if (row && Number(row.found) === DEMAND_OBJECTS.length) return 0;

  for (const statement of DEMAND_SCHEMA) await sqlRun(statement);
  return DEMAND_SCHEMA.length;
}

// Are the demands in D1? The same reasoning, and the same reading of a table
// that is not there against a database that will not answer, as the three
// modules above.
let demandsFilled = false;

export async function demandsAreInSql(): Promise<boolean> {
  if (demandsFilled) return true;
  try {
    const row = await sqlFirst<{ value: number }>(
      `SELECT value FROM ${DEMAND_FLAG_TABLE} WHERE flag = ?`,
      [DEMANDS_FILLED]
    );
    demandsFilled = !!row && Number(row.value) === 1;
    return demandsFilled;
  } catch (err) {
    if (isMissingTable(err)) return false;
    throw err;
  }
}

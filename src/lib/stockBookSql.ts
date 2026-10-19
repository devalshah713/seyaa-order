// The stock book, in SQL.
//
// This is the D1 half of stockBookStore.ts. The store decides which half to
// use; this file never does. It holds the statements and nothing else.
//
// The same three rules as the four books that moved before it.
//
// One: a save is one row. Taking a piece into stock, correcting one, or taking
// one out writes that entry's row and reads at most that entry.
//
// Two: fifty queries per request, and never a query per entry. The copy hands
// whole chunks over as JSON and SQLite expands them; the list page asks for one
// page of columns in one statement.
//
// Three: S0411 follows S0410 with nothing missing, and two pieces taken into
// stock in the same moment never both become S0410. The number is raised and
// used inside one transaction, by the database. See sqlCreateStockEntry(), and
// the note there on why this one book issues its number itself rather than
// through takeNextNumber().
import "server-only";
import { sqlAll, sqlBatch, sqlFirst, sqlRun } from "./sql";
import {
  STOCK_COLUMNS,
  STOCK_COUNTER_TABLE,
  STOCK_FLAG_TABLE,
  STOCK_SEQ,
  STOCK_TABLE,
  columnNames,
} from "./sqlSchema";
import {
  contains,
  designHead,
  flatColumn,
  flatText,
  insertRows,
  keyChunks,
  putRow,
  sqlCounterValue,
  sqlSetCounterValues,
  sqlSetFlagValue,
  sqlTableCount,
  sqlTableIds,
  startsWith,
  stockKeyColumn,
} from "./sqlRecords";
import type { StockEntry, StockLine, StockRow } from "./stockBookConfig";

function parseDoc(row: { doc: string }): StockEntry {
  return JSON.parse(row.doc) as StockEntry;
}

const str = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value);

// --- Reading ------------------------------------------------------------------

// The book's own order: newest piece first, and inside one moment by stock
// number. The second key is how two entries saved in the same millisecond keep
// a settled order; length before text puts S10000 after S9999 rather than
// between S1 and S2, which is what comparing the two as plain text would do.
const BOOK_ORDER = "created_at DESC, length(stock_no), stock_no";

// Every entry as it is stored, newest first. Used where a reader wants whole
// entries: the Excel export, the nightly backup, the Google Sheet, and QC.
export async function sqlListStockEntries(): Promise<StockEntry[]> {
  const rows = await sqlAll<{ doc: string }>(
    `SELECT doc FROM ${STOCK_TABLE} ORDER BY ${BOOK_ORDER}`
  );
  return rows.map(parseDoc);
}

export async function sqlGetStockEntry(id: string): Promise<StockEntry | null> {
  const row = await sqlFirst<{ doc: string }>(
    `SELECT doc FROM ${STOCK_TABLE} WHERE id = ?`,
    [id]
  );
  return row ? parseDoc(row) : null;
}

// --- One page of the book -----------------------------------------------------
//
// The page used to be handed every entry in the book. The narrowing the
// database can do is the cheap part: a date range, a location, and a LIKE over
// the searched columns. What it must not try to do is design numbers, for the
// same reason the register's page does not: "SN-BR-AMF-10CT-46" names one piece
// of a run written "SN-BR-AMF-10CT-45-49", and deciding that is matchDesign()'s
// job, which is arithmetic on the parts of a number rather than anything LIKE
// can express.
//
// So this returns candidates, not answers: every entry that could match, in the
// book's own order, and the store applies searchStock() to them. The LIKE
// clauses are therefore deliberately generous — a candidate too many costs one
// row read, a candidate too few loses an entry the book used to find.
export type StockQuery = {
  q: string;
  from: string;
  to: string;
  location: string;
};

// The columns the box above the book searches as plain text, which is what
// searchStock() does with them.
const SEARCHED_COLUMNS = [
  "stock_no", "design", "design_no", "category", "sub_category",
  "sub_sub_category", "location", "gold_details", "party_name", "comments",
];

// And the three fields of a diamond line the box searches: the shape, the
// sieve and the product code.
//
// Asked of the lines one at a time rather than by matching the stored JSON as
// text, which is the obvious thing and is wrong. The stored text carries the
// field names as well as the values, and "shape" ends in the letters PE, which
// is a real shape code: a search for PE matched every entry in the book, the
// cap then cut the candidates off part way through, and the page both lost
// genuine matches further down and said a thousand pieces matched when three
// hundred did. json_each takes the lines apart so only the values are compared,
// which is what searchStock() compares.
const SEARCHED_LINE_FIELDS = ["shape", "sieve", "code"];

// A column holding something that will not parse as JSON reads as an entry with
// no diamond sizes on it, which is what parseLines() does with it on the way
// out. Without the guard json_each would fail, and one unreadable column would
// take the whole page down with it rather than one entry's stone sizes.
const LINES_MATCH = `EXISTS (
    SELECT 1
    FROM json_each(CASE WHEN json_valid(lines) THEN lines ELSE '[]' END) AS l
    WHERE ${SEARCHED_LINE_FIELDS
      .map((field) => `json_extract(l.value, '$.${field}') LIKE ? ESCAPE '\\'`)
      .join(" OR ")}
  )`;

// The page's own columns, and no `doc`. This is the read the page lives on and
// the reason the columns exist: an entry also carries its inch size, its
// factory and its links back to the jangad entries, the PD sheet, the demands
// and the memos it came from, none of which the table shows.
const PAGE_COLUMNS = `id, stock_no, stock_date, design, design_no, category,
  sub_category, sub_sub_category, location, gold_details, gross_wt, net_wt,
  party_name, polki_labour, comments, lines`;

// A column holding JSON that will not parse is a column written by something
// other than this portal. Reading it as "no diamond sizes recorded" keeps the
// page drawing rather than failing whole, which is the reading the store has
// always given an entry with no lines on it.
function parseLines(value: unknown): StockLine[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as StockLine[]) : [];
  } catch {
    console.error("A stock entry's diamond sizes could not be read as JSON.");
    return [];
  }
}

function toRow(row: Record<string, unknown>): StockRow {
  return {
    id: str(row.id),
    stockNo: str(row.stock_no),
    date: str(row.stock_date),
    design: str(row.design),
    designNo: str(row.design_no),
    category: str(row.category),
    subCategory: str(row.sub_category),
    subSubCategory: str(row.sub_sub_category),
    location: str(row.location),
    goldDetails: str(row.gold_details),
    grossWt: str(row.gross_wt),
    netWt: str(row.net_wt),
    partyName: str(row.party_name),
    polkiLabour: Number(row.polki_labour) === 1,
    comments: str(row.comments),
    lines: parseLines(row.lines),
  };
}

export async function sqlStockPage(
  query: StockQuery,
  limit: number
): Promise<StockRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  // Dates are stored as yyyy-mm-dd, which compares correctly as text. An entry
  // with no date at all is outside every range rather than inside the open end
  // of one, which is how the book has always read it.
  if (query.from) {
    where.push(`stock_date <> '' AND stock_date >= ?`);
    params.push(query.from);
  }
  if (query.to) {
    where.push(`stock_date <> '' AND stock_date <= ?`);
    params.push(query.to);
  }
  if (query.location) {
    where.push(`location = ?`);
    params.push(query.location);
  }

  const needle = query.q.trim();
  if (needle) {
    const ors = SEARCHED_COLUMNS.map((name) => `${name} LIKE ? ESCAPE '\\'`);
    for (let i = 0; i < SEARCHED_COLUMNS.length; i++) params.push(contains(needle));
    ors.push(LINES_MATCH);
    for (let i = 0; i < SEARCHED_LINE_FIELDS.length; i++) params.push(contains(needle));
    // The design number without its separators, so a search that names part of
    // a number still finds it however either side is punctuated.
    ors.push(`${flatColumn("design_no")} LIKE ? ESCAPE '\\'`);
    params.push(contains(flatText(needle)));
    const head = designHead(needle);
    if (head) {
      ors.push(`${flatColumn("design_no")} LIKE ? ESCAPE '\\'`);
      params.push(startsWith(head));
    }
    where.push(`(${ors.join(" OR ")})`);
  }

  params.push(limit);
  const rows = await sqlAll<Record<string, unknown>>(
    `SELECT ${PAGE_COLUMNS}
FROM ${STOCK_TABLE}${where.length ? ` WHERE ${where.join(" AND ")}` : ""}
ORDER BY ${BOOK_ORDER} LIMIT ?`,
    params
  );
  return rows.map(toRow);
}

// Every place the book has ever held stock in, for the filter dropdown.
//
// Counted by the database rather than gathered out of the rows the page was
// given, which only worked while the page was given all of them. A place the
// current page happens not to mention is still a place somebody wants to filter
// by.
export async function sqlStockLocations(): Promise<string[]> {
  const rows = await sqlAll<{ location: string }>(
    `SELECT DISTINCT location FROM ${STOCK_TABLE} WHERE location <> '' ORDER BY location`
  );
  return rows.map((row) => str(row.location));
}

// --- Several stock numbers at once, for the audit ------------------------------

// The book's entry for each of these numbers, as the page's own columns.
//
// One statement for the whole list, not one per number, and the page's columns
// rather than the stored records: the audit shows a piece's design, weights,
// place, party and stone sizes and prices it at today's rates, all of which
// these columns carry. The entry's inch size and its links back to the jangad
// and the PD sheet are not shown here, so they are not read.
//
// The numbers are compared by the audit's own rule, which case alone would not
// cover: a stock number typed by hand on the way in is kept as it was typed.
export async function sqlStockByNos(keys: string[]): Promise<StockRow[]> {
  if (keys.length === 0) return [];
  const out: StockRow[] = [];
  for (const chunk of keyChunks(keys)) {
    const marks = chunk.map(() => "?").join(", ");
    const rows = await sqlAll<Record<string, unknown>>(
      `SELECT ${PAGE_COLUMNS}
FROM ${STOCK_TABLE} WHERE ${stockKeyColumn("stock_no")} IN (${marks})
ORDER BY ${BOOK_ORDER}`,
      chunk
    );
    out.push(...rows.map(toRow));
  }
  return out;
}

// --- Writing ------------------------------------------------------------------

// The entry written under the next stock number.
//
// Two statements go to the database as one batch, which D1 runs as a single
// transaction: the counter is raised by one, in the database, by the database,
// and then the entry is written using the value that statement just produced,
// read back inside the same transaction. Two pieces taken into stock at the
// same moment become two transactions, which SQLite runs one after the other,
// so the second sees 410 committed and takes 411. Neither shares a number, and
// none is skipped, because an entry that fails to be written also unwinds the
// number it would have used. This is takeNextNumber()'s reasoning exactly.
//
// It is not takeNextNumber() itself, and the reason is the one thing this book
// does that the other four do not: a stock number typed by hand wins. Pieces
// come in from elsewhere with numbers already on them, and the counter still
// has to move so the next piece entered here is given a free number.
// takeNextNumber() writes the issued number into the record unconditionally,
// which would overwrite the typed one. So the number the row and the record
// carry is the typed one where there is one and the issued one where there is
// not, which is what NULLIF asks, and the entry's id comes off the counter
// either way because the id is this portal's own and nobody types it.
export async function sqlCreateStockEntry(
  entry: StockEntry,
  templates: { id: string; no: string }
): Promise<StockEntry> {
  const names = columnNames(STOCK_COLUMNS);
  const params: unknown[] = [];
  // The number the counter now stands at, having just been raised.
  const issued = (template: string) => {
    params.push(template);
    return "printf(?, c.value)";
  };

  const picks = STOCK_COLUMNS.map((column) => {
    if (column.name === "id") return issued(templates.id);
    if (column.name === "stock_no") {
      params.push(entry.stockNo);
      return `COALESCE(NULLIF(?, ''), ${issued(templates.no)})`;
    }
    params.push(column.get(entry));
    return "?";
  });

  // And the same two fields inside the stored record, so the row and the record
  // it holds can never disagree about which entry this is or what number it was
  // taken in under.
  params.push(JSON.stringify(entry), templates.id, entry.stockNo);
  picks.push(
    `json_set(json_set(?, '$.id', printf(?, c.value)), '$.stockNo', COALESCE(NULLIF(?, ''), ${issued(templates.no)}))`
  );
  params.push(STOCK_SEQ);

  const results = await sqlBatch<{ doc: string }>([
    {
      query: `INSERT INTO ${STOCK_COUNTER_TABLE} (counter_key, value) VALUES (?, 1)
ON CONFLICT(counter_key) DO UPDATE SET value = value + 1`,
      params: [STOCK_SEQ],
    },
    {
      query: `INSERT INTO ${STOCK_TABLE} (${names.join(", ")})
SELECT ${picks.join(", ")}
FROM ${STOCK_COUNTER_TABLE} c WHERE c.counter_key = ?
RETURNING doc`,
      params,
    },
  ]);

  const doc = results[1]?.results?.[0]?.doc;
  if (!doc) {
    // The transaction either wrote the entry or it did not. Nothing half-done
    // is possible here, so this is a failure to report rather than a state to
    // repair.
    throw new Error(
      "The entry was not saved, so no stock number was taken. Nothing was changed."
    );
  }
  return parseDoc({ doc });
}

// An edit: one row replaced by itself with the changes in it. Every column is
// written, so there is nothing to merge and the page's columns cannot be left
// describing the entry as it was before the edit.
export async function sqlPutStockEntry(entry: StockEntry): Promise<void> {
  await putRow(STOCK_TABLE, STOCK_COLUMNS, entry);
}

export async function sqlDeleteStockEntry(id: string): Promise<boolean> {
  const { changes } = await sqlRun(`DELETE FROM ${STOCK_TABLE} WHERE id = ?`, [id]);
  return changes > 0;
}

// --- The running number, the flag, and the copy --------------------------------

// What the book stands at, for the next-number preview on the form. Nothing is
// taken: the next save takes its own, inside its own transaction, and if
// somebody else saves first the preview was a guess.
export async function sqlStockCounter(): Promise<number> {
  return sqlCounterValue(STOCK_COUNTER_TABLE, STOCK_SEQ);
}

// The number set outright, which only the copy may do. A number already in D1
// that has gone further belongs to entries written here since, and winding it
// back would hand out a number that is already on a piece.
export async function sqlSetStockCounter(seq: number): Promise<void> {
  await sqlSetCounterValues(STOCK_COUNTER_TABLE, { [STOCK_SEQ]: seq });
}

export async function sqlSetStockFlag(flag: string, value = 1): Promise<void> {
  await sqlSetFlagValue(STOCK_FLAG_TABLE, flag, value);
}

export async function sqlStockCount(): Promise<number> {
  return sqlTableCount(STOCK_TABLE);
}

// The ids the book already holds, so a copy that has to be run more than once
// can leave out what is already across instead of offering it again.
export async function sqlStockIds(): Promise<Set<string>> {
  return sqlTableIds(STOCK_TABLE);
}

// The entries into the table, as one statement per chunk. Every column of this
// table is a field of the entry, so the database expands the records itself and
// the portal never flattens them, as the memo book and the register do.
export async function insertStockEntries(entries: StockEntry[]): Promise<void> {
  await insertRows(STOCK_TABLE, STOCK_COLUMNS, entries);
}

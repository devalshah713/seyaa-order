// The statements every module writes the same way, in one place.
//
// Four modules now keep their records in D1 and all four write them under the
// same three rules, so the statements that follow from those rules are written
// once here rather than four times:
//
//   * a save is one row, so one record goes in as one statement;
//   * fifty queries per request and never a query per record, so many records
//     go in as one statement with the whole chunk handed over as JSON;
//   * a number, once taken, is never taken twice and never skipped, which is
//     takeNextNumber() at the foot of this file and the one genuinely subtle
//     thing in it.
//
// What is not here is anything a module decides for itself: which table, which
// counter table, which columns, what the records are. Those are arguments. The
// memo book, the jangad register, the PD sheets and the demands each keep their
// own tables and their own counters, and nothing in this file knows about any
// of them.
//
// This was lifted out of memoSql.ts unchanged, the day the PD sheets and the
// demands followed the memos across. Three copies of numbering that must never
// hand out the same serial twice would have been three chances to get it wrong.
import "server-only";
import { sqlAll, sqlBatch, sqlFirst, sqlRun } from "./sql";
import { columnNames, columnValues, type SqlColumn } from "./sqlSchema";
import { parseDesignNo } from "./designNo";
import { STOCK_MARKS } from "./memoFormat";

// --- Writing records ---------------------------------------------------------

// One whole record, written as one row. Used for a save and for an edit alike:
// the record carries its own id, so there is nothing to decide.
//
// OR REPLACE rather than an upsert clause because every column is written every
// time. There is no half-update to merge, and nothing else in the row to
// preserve.
export function putRowCall<T>(table: string, columns: SqlColumn<T>[], record: T) {
  const names = columnNames(columns);
  const marks = names.map(() => "?").join(", ");
  return {
    query: `INSERT OR REPLACE INTO ${table} (${names.join(", ")}) VALUES (${marks})`,
    params: columnValues(columns, record),
  };
}

export async function putRow<T>(
  table: string,
  columns: SqlColumn<T>[],
  record: T
): Promise<void> {
  const call = putRowCall(table, columns, record);
  await sqlRun(call.query, call.params);
}

const blankOf = <T,>(column: SqlColumn<T>): string =>
  typeof column.blank === "string" ? `'${column.blank}'` : String(column.blank);

// Many records, as one query.
//
// The whole chunk goes in as a single JSON array and SQLite's json_each() turns
// it into rows, so the cost is one query whether there are two records or two
// hundred. This is what keeps the fifty-query allowance irrelevant to how many
// records there are.
//
// OR IGNORE so a record already present is left exactly as it is: that is what
// makes the copy safe to run twice, and it is also why the copy can never
// overwrite something the office has changed since.
function insertRowsCall<T>(table: string, columns: SqlColumn<T>[], records: T[]) {
  const names = columnNames(columns);
  const picks = columns.map(
    (column) => `COALESCE(json_extract(r.value, '${column.path}'), ${blankOf(column)})`
  );
  // `r.value` is the element itself, which is the record, which is `doc`.
  picks.push("r.value");
  return {
    query: `INSERT OR IGNORE INTO ${table} (${names.join(", ")})
SELECT ${picks.join(", ")} FROM json_each(?) AS r`,
    params: [JSON.stringify(records)],
  };
}

export async function insertRows<T>(
  table: string,
  columns: SqlColumn<T>[],
  records: T[]
): Promise<void> {
  if (records.length === 0) return;
  const call = insertRowsCall(table, columns, records);
  await sqlRun(call.query, call.params);
}

// --- Records whose columns are not fields of the record ----------------------
//
// Some columns hold something worked out from a record rather than a field of
// it: the demand list's prepared search text, the count of a PD sheet's pieces
// that reached the stock book. Those have no JSON path, so the copy above
// cannot reach them.
//
// Writing the same calculation again in SQL would be two descriptions of one
// rule with nothing keeping them in step, and the rule is the one the list page
// reads, so a disagreement would show up as a wrong figure on screen rather
// than as an error. Instead the portal works every column out, exactly as the
// save does, hands the database a flattened record per row, and the database
// expands that. Still one query however many records.

// A record reduced to the columns it is stored under, plus the record itself.
export type FlatRow = Record<string, unknown>;

export function flattenRow<T>(columns: SqlColumn<T>[], record: T): FlatRow {
  const names = columnNames(columns);
  const values = columnValues(columns, record);
  const flat: FlatRow = {};
  names.forEach((name, i) => {
    flat[name] = values[i];
  });
  return flat;
}

export async function insertFlatRows<T>(
  table: string,
  columns: SqlColumn<T>[],
  flat: FlatRow[]
): Promise<void> {
  if (flat.length === 0) return;
  const names = columnNames(columns);
  // Quoted, because a column could be named something SQLite reads as its own
  // word, and a path is cheaper to quote than to think about.
  const picks = columns.map(
    (column) => `COALESCE(json_extract(r.value, '$."${column.name}"'), ${blankOf(column)})`
  );
  picks.push(`json_extract(r.value, '$."doc"')`);
  await sqlRun(
    `INSERT OR IGNORE INTO ${table} (${names.join(", ")})
SELECT ${picks.join(", ")} FROM json_each(?) AS r`,
    [JSON.stringify(flat)]
  );
}

// --- Taking the next number --------------------------------------------------
//
// These numbers are the business's own serial numbers. SS/26-27/008 must follow
// SS/26-27/007 with nothing missing in between, PD/26-27/012 must follow
// PD/26-27/011, and two people saving at the same moment must never both be
// given the same one.
//
// Against the JSON document that was true by luck. A save read the whole book,
// took the next number, and wrote the whole book back; two saves a few
// milliseconds apart both read 007 and the second overwrote the first.
//
// Here the number is never read into the portal at all. Two statements go to
// the database as one batch, which D1 runs as a single transaction:
//
//   1. the counter for that book is raised by one, in the database, by the
//      database. Nothing is read first, so there is no stale reading to act on.
//   2. the record is written using the value that statement 1 just produced,
//      read back inside the same transaction.
//
// Because it is one transaction, either both happen or neither does. Two saves
// at once become two transactions, and SQLite runs them one after the other:
// the second sees 008 committed and takes 009. No number is shared, and none is
// skipped, because a record that fails to be written also unwinds the number it
// would have used.
//
// The record comes back out of the database rather than being assembled here,
// so what the portal shows the person is exactly the row that was stored.

// A number no book will ever reach, used to find out how a number is printed
// without writing that format down a second time. The module's own formatter is
// asked to format the sentinel, and the sentinel is swapped for SQLite's own
// placeholder. If the formats ever change, this changes with them.
const SENTINEL = 7777777;

// How wide the padding is comes out of the formatter too, rather than being
// assumed: PD/26-27/012 pads to three, JG-04910 to five and SB-00412 to five,
// and a template that said three for all of them would write SB-412.
//
// Measured by asking the formatter for a one-digit serial as well: everything
// in a printed number that is not the number itself is the same length in both,
// so what is left over is the width the padding reaches.
export function numberTemplate(format: (seq: number) => string): string {
  const printed = format(SENTINEL);
  const fixed = printed.length - String(SENTINEL).length;
  const width = format(1).length - fixed;
  return printed.replace(String(SENTINEL), `%0${width}d`);
}

// Where a record's own number lives: which column holds it, and where it sits
// inside the stored record. Memos and orders differ (memoNo against orderNo),
// and so do PD sheets and demands, so it is said once per table rather than
// written into the query.
export type NumberFields = {
  id: { column: string; path: string };
  no: { column: string; path: string };
  seq: { column: string; path: string };
};

// The insert half of the transaction, built from the table's own column list so
// there is no second list of columns to keep in step.
function insertWithNumberCall<T>(
  table: string,
  columns: SqlColumn<T>[],
  record: T,
  templates: { id: string; no: string },
  fields: NumberFields,
  counterTable: string,
  counterKey: string
) {
  const names = columnNames(columns);
  const params: unknown[] = [];
  const picks: string[] = columns.map((column) => {
    // The three fields that are the number itself come from the counter, not
    // from the record: the record was built before the number was known.
    if (column.name === fields.id.column) {
      params.push(templates.id);
      return "printf(?, c.value)";
    }
    if (column.name === fields.no.column) {
      params.push(templates.no);
      return "printf(?, c.value)";
    }
    if (column.name === fields.seq.column) return "c.value";
    params.push(column.get(record));
    return "?";
  });

  // And the same three fields inside the stored record, so the row and the
  // record it holds can never disagree about the number it was issued under.
  params.push(JSON.stringify(record), templates.id, templates.no);
  picks.push(
    `json_set(json_set(json_set(?, '${fields.seq.path}', c.value), '${fields.id.path}', printf(?, c.value)), '${fields.no.path}', printf(?, c.value))`
  );
  params.push(counterKey);

  return {
    query: `INSERT INTO ${table} (${names.join(", ")})
SELECT ${picks.join(", ")}
FROM ${counterTable} c WHERE c.counter_key = ?
RETURNING doc`,
    params,
  };
}

export async function takeNextNumber<T>(
  table: string,
  columns: SqlColumn<T>[],
  record: T,
  counters: { table: string; key: string },
  templates: { id: string; no: string },
  fields: NumberFields
): Promise<T> {
  const results = await sqlBatch<{ doc: string }>([
    {
      query: `INSERT INTO ${counters.table} (counter_key, value) VALUES (?, 1)
ON CONFLICT(counter_key) DO UPDATE SET value = value + 1`,
      params: [counters.key],
    },
    insertWithNumberCall(
      table, columns, record, templates, fields, counters.table, counters.key
    ),
  ]);

  const doc = results[1]?.results?.[0]?.doc;
  if (!doc) {
    // The transaction either wrote the row or it did not. Nothing half-done is
    // possible here, so this is a failure to report rather than a state to
    // repair.
    throw new Error("The record was not saved, so no number was taken. Nothing was changed.");
  }
  return JSON.parse(doc) as T;
}

// --- Counters and flags ------------------------------------------------------
//
// Every module keeps its own pair of these tables, with the same two columns in
// each, so the statements are the same and only the table name differs. They
// are separate tables on purpose: backing one module's counters up and putting
// them back must not be able to carry another module's with them.

// What a book stands at, for a live preview of the next number on a form.
// Nothing is taken: the next save takes its own number, and if somebody else
// saves first the preview was a guess and the saved record is right.
export async function sqlCounterValue(
  counterTable: string,
  counterKey: string
): Promise<number> {
  return firstNumber(`SELECT value FROM ${counterTable} WHERE counter_key = ?`, [counterKey]);
}

// Counters set outright, for the copy. The copy is the only thing that may do
// this: afterwards a counter only ever goes up, by one, inside the transaction
// that uses the number.
//
// MAX rather than a plain assignment: a counter already in D1 that has gone
// further than the R2 document's belongs to records written here since, and
// winding it back would hand out a number that is already on the books.
export async function sqlSetCounterValues(
  counterTable: string,
  counters: Record<string, number>
): Promise<void> {
  const entries = Object.entries(counters);
  if (entries.length === 0) return;
  // One statement for the lot, as JSON, rather than one per book.
  //
  // The WHERE is not a filter and cannot be dropped: SQLite refuses to parse an
  // ON CONFLICT clause on an INSERT that selects its rows unless the SELECT has
  // one, because without it "DO" could be read as a table alias.
  await sqlRun(
    `INSERT INTO ${counterTable} (counter_key, value)
SELECT json_extract(r.value, '$[0]'), json_extract(r.value, '$[1]')
FROM json_each(?) AS r WHERE true
ON CONFLICT(counter_key) DO UPDATE SET value = MAX(${counterTable}.value, excluded.value)`,
    [JSON.stringify(entries)]
  );
}

export async function sqlAllCounters(counterTable: string): Promise<Record<string, number>> {
  const rows = await sqlAll<{ counter_key: string; value: number }>(
    `SELECT counter_key, value FROM ${counterTable}`
  );
  const out: Record<string, number> = {};
  for (const row of rows) {
    const n = Number(row.value);
    out[String(row.counter_key)] = isFinite(n) ? n : 0;
  }
  return out;
}

export async function sqlSetFlagValue(
  flagTable: string,
  flag: string,
  value = 1
): Promise<void> {
  await sqlRun(
    `INSERT INTO ${flagTable} (flag, value) VALUES (?, ?)
ON CONFLICT(flag) DO UPDATE SET value = excluded.value`,
    [flag, value]
  );
}

// --- Narrowing a list page ---------------------------------------------------
//
// Two pages are now too long to hand the browser whole, the jangad register and
// the stock book, so both ask the database for the entries they are showing.
// Neither asks it to decide what a phrase names: a design number is matched by
// matchDesign(), which is arithmetic on the parts of a number rather than
// anything LIKE can express. The database narrows generously and hands back
// candidates, and the page's own matcher picks the answers out of them.
//
// What the two share is how a typed phrase and a stored column are made
// comparable, and it is written once here because getting it wrong in one of
// them and right in the other would show up as a row the search used to find
// and no longer does.

// What a design number is compared without. matchDesign() ignores every
// separator, so "snbramf" finds "SN-BR-AMF-…" and a piece written with slashes
// finds one written with dashes.
//
// The two sides are stripped differently, and that is deliberate. A phrase that
// was typed is stripped of everything matchDesign() would strip, because that
// is what it will be compared against. A column can only be stripped of a list
// of characters, since SQLite has no pattern replace, so it loses the
// separators design numbers are actually written with. Stripping the typed
// phrase harder than the column can only widen what comes back, never narrow
// it, and a number written with some other punctuation is still found by the
// plain-text clauses, which compare it exactly as typed.
const SEPARATORS = ["-", " ", "/", "_", "+", "#", "&", ",", "(", ")"];

export const flatColumn = (expr: string): string =>
  SEPARATORS.reduce((sql, ch) => `replace(${sql}, '${ch}', '')`, `upper(${expr})`);

// The same rule as flat() in designNo.ts: a separator is anything that is not a
// letter, a digit or a decimal point.
export const flatText = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9.]/g, "");

// A LIKE pattern for a typed phrase. The two wildcards and the escape itself
// are escaped, so a stock code with an underscore in it searches for that
// underscore rather than for any character.
const forLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);
export const contains = (s: string): string => `%${forLike(s)}%`;
export const startsWith = (s: string): string => `${forLike(s)}%`;

// --- Asking several modules about the same stock numbers ---------------------

// A stored stock number, reduced to what it is compared as.
//
// The rule itself is stockKey() in memoFormat.ts, and this is built from the
// very same list of marks rather than from a second list of its own: the
// database narrows by exactly the rule the answer is then checked against, so
// the screen and the database cannot disagree about which piece was asked for.
//
// A nest of replaces rather than anything cleverer because SQLite has no
// pattern replace. It costs a scan of the column, which is what a question
// about a stock number costs in any case: no table here is indexed on one.
export const stockKeyColumn = (expr: string): string =>
  [...STOCK_MARKS].reduce(
    (sql, mark) => `replace(${sql}, '${mark.replace(/'/g, "''")}', '')`,
    `upper(${expr})`
  );

// How many stock numbers one IN list carries. D1 allows a hundred bound values
// in a statement, so fifty leaves room, and fifty is also the most the audit
// takes in one run — so a full run is one statement per module and never one
// per number.
export const KEYS_PER_QUERY = 50;

export function keyChunks(keys: string[]): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < keys.length; i += KEYS_PER_QUERY) {
    chunks.push(keys.slice(i, i + KEYS_PER_QUERY));
  }
  return chunks;
}

// The codes a search writes before the piece number: "SN-BR-AMF-10CT" out of
// "SN-BR-AMF-10CT-46". A piece match needs those codes to be exactly the ones
// the row carries, so every row that could be the piece being asked for has a
// design number starting with them. That is a prefix, which the database can
// answer, and it is how a piece inside a run is still found when the run is
// written into the design number itself.
export function designHead(needle: string): string {
  const asked = parseDesignNo(needle);
  if (asked.spanned || asked.at <= 0) return "";
  return flatText(asked.segs.slice(0, asked.at).join(""));
}

// --- Counting, for the admin screen ------------------------------------------

// The ids one table already holds, so a copy that has to be run more than once
// can leave out what is already across instead of offering it again. One
// column, one query, and only asked for when the table is not empty.
export async function sqlTableIds(table: string): Promise<Set<string>> {
  const rows = await sqlAll<{ id: string }>(`SELECT id FROM ${table}`);
  return new Set(rows.map((row) => String(row.id)));
}

export async function sqlTableCount(table: string): Promise<number> {
  return firstNumber(`SELECT COUNT(*) AS value FROM ${table}`);
}

// A query that answers with one number, unwrapped once here rather than at
// every call. A missing row reads as nought, which is the right answer for both
// a counter nobody has taken a number from and an empty table.
async function firstNumber(query: string, params: unknown[] = []): Promise<number> {
  const row = await sqlFirst<{ value: number }>(query, params);
  const n = Number(row?.value);
  return isFinite(n) ? n : 0;
}

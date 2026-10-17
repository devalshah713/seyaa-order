// The jangad register, in SQL.
//
// This is the D1 half of jangadStore.ts. The store decides which half to use;
// this file never does. It holds the statements and nothing else.
//
// Three rules shape all of it, the same three that shape memoSql.ts.
//
// One: a save is one row. That is the whole reason the register moved. Nothing
// here reads the register in order to change a line of it, and nothing here
// writes a row it was not asked to write.
//
// Two: fifty queries per request, and never a query per row. A screenful of
// edits is one statement, not one statement per line: the whole screenful goes
// in as JSON and SQLite expands it. The accountant who ticks forty lines and
// presses save once must not spend the request's whole allowance.
//
// Three: a serial, once taken, is never taken twice and never skipped. JG-04911
// follows JG-04910 with nothing missing, so the register's own numbering is
// done by the database inside the transaction that uses it. See
// sqlAddJangadRows().
import "server-only";
import { sqlAll, sqlBatch, sqlFirst, sqlRun } from "./sql";
import {
  JANGAD_COUNTER_TABLE,
  JANGAD_FLAG_TABLE,
  JANGAD_ROW_COLUMNS,
  JANGAD_SEQ,
  JANGAD_TABLE,
  columnNames,
  type SqlColumn,
} from "./sqlSchema";
import { JANGAD_FIELDS, type JangadField, type JangadRow } from "./jangadConfig";

// --- Reading -----------------------------------------------------------------
//
// Every read here asks for `doc` rather than for the columns.
//
// That looks like the opposite of what the memo history does, and it is, for a
// reason: the register draws all 28 of its columns on screen at once and
// searches a 29th that no column holds, so a row rebuilt from its columns would
// be a row with most of it missing. There is nothing to save by reading the
// small columns when every one of them is wanted anyway. The columns exist for
// the WHERE and the ORDER BY, which is work the database does instead of the
// portal doing it.

function parseDoc(row: { doc: string }): JangadRow {
  return JSON.parse(row.doc) as JangadRow;
}

// The register, newest batch first, and inside a batch in the order the rows
// were entered so the pieces of one design stay together and in number order.
//
// The second and third keys are how the entry order is recovered: the serial in
// the id is the order, and length before text puts JG-100000 after JG-99999
// rather than between JG-1 and JG-2, which is what comparing the two as plain
// text would do once the register passes its hundred thousandth row.
export async function sqlListJangad(): Promise<JangadRow[]> {
  const rows = await sqlAll<{ doc: string }>(
    `SELECT doc FROM ${JANGAD_TABLE} ORDER BY created_at DESC, length(id), id`
  );
  return rows.map(parseDoc);
}

export async function sqlGetJangadRow(id: string): Promise<JangadRow | null> {
  const row = await sqlFirst<{ doc: string }>(
    `SELECT doc FROM ${JANGAD_TABLE} WHERE id = ?`,
    [id]
  );
  return row ? parseDoc(row) : null;
}

// The rows behind a print. One statement with an IN list rather than one query
// per id, because a slip can be forty lines and forty queries is most of the
// allowance. The order asked for is restored afterwards: a slip should read in
// the order the register showed, which is not the order a database hands rows
// back in.
export async function sqlGetJangadRows(ids: string[]): Promise<JangadRow[]> {
  if (ids.length === 0) return [];
  const marks = ids.map(() => "?").join(", ");
  const rows = await sqlAll<{ doc: string }>(
    `SELECT doc FROM ${JANGAD_TABLE} WHERE id IN (${marks})`,
    ids
  );
  const byId = new Map(rows.map((row) => parseDoc(row)).map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is JangadRow => !!r);
}

// What the register already holds against every piece, for the issue screen's
// piece picker.
//
// The picker needs eight of the twenty-eight columns and needs them for every
// row ever entered, so this is the one read that is genuinely cheaper from the
// columns than from `doc`. Against the R2 document it was the whole register
// read into memory to build one map.
//
// Oldest first, which is the order the rows sit in inside the R2 document. It
// matters: the picker shows one date, one memo and one factory per piece, and it
// is the first issue against that piece that it shows. Newest first would put a
// later add-on's paperwork where the original issue's belongs.
export type JangadIssueLine = {
  designNo: string;
  subDesignNo: string;
  date: string;
  memoNo: string;
  mfgName: string;
  shape: string;
  size: string;
  pcs: string;
};

export async function sqlJangadIssueLines(): Promise<JangadIssueLine[]> {
  const rows = await sqlAll<Record<string, unknown>>(
    `SELECT design_no, sub_design_no, jangad_date, memo_no, mfg_name, shape, size, pcs
FROM ${JANGAD_TABLE} ORDER BY created_at, length(id), id`
  );
  const str = (value: unknown): string =>
    value === null || value === undefined ? "" : String(value);
  return rows.map((row) => ({
    designNo: str(row.design_no),
    subDesignNo: str(row.sub_design_no),
    date: str(row.jangad_date),
    memoNo: str(row.memo_no),
    mfgName: str(row.mfg_name),
    shape: str(row.shape),
    size: str(row.size),
    pcs: str(row.pcs),
  }));
}

export async function sqlJangadCount(): Promise<number> {
  const row = await sqlFirst<{ rows: number }>(
    `SELECT COUNT(*) AS rows FROM ${JANGAD_TABLE}`
  );
  const n = Number(row?.rows);
  return isFinite(n) ? n : 0;
}

// --- Adding a batch ----------------------------------------------------------
//
// Diamonds go out a design at a time, so rows arrive in batches and every row in
// a batch needs the next serial in turn.
//
// Against the JSON document that was done by reading the register, adding to the
// end of it and writing the whole thing back, which is both the fault this move
// exists to fix and a way to lose a row: two batches saved a moment apart both
// read the same serial and the second wrote over the first.
//
// Here the serial is never read into the portal at all. Two statements go as one
// batch, which D1 runs as a single transaction:
//
//   1. the register's running number is raised by however many rows are being
//      added, in the database, by the database. Nothing is read first, so there
//      is no stale number to act on.
//   2. the rows are written in one statement, each taking its own serial out of
//      the number statement 1 just produced, read back inside the same
//      transaction.
//
// Either both happen or neither does. Two batches at once become two
// transactions which SQLite runs one after the other, so the second sees the
// first's numbers committed and carries on from them. No serial is shared and
// none is skipped.

// A serial no register will ever reach. jangadIdFor() is asked to print it, and
// the printed sentinel is swapped for SQLite's own placeholder, so the format of
// an id is written down once, in the store, and this follows it. The width is
// taken from what the formatter does to a real serial rather than assumed.
const SENTINEL = 7777777;

export function jangadIdTemplate(format: (seq: number) => string): string {
  const printed = format(SENTINEL);
  // Everything in a printed id that is not the number itself, so a one-digit
  // serial's padding can be measured.
  const fixed = printed.length - String(SENTINEL).length;
  const width = format(1).length - fixed;
  return printed.replace(String(SENTINEL), `%0${width}d`);
}

// Where a value comes from when the database is expanding records itself: the
// field inside the JSON in hand, or the column's blank if the record has not got
// that field. Every column is NOT NULL and carries a blank rather than a null,
// so a record written before a column existed still goes in.
function pickFrom<T>(column: SqlColumn<T>, element: string, path = column.path): string {
  const blank = typeof column.blank === "string" ? `'${column.blank}'` : String(column.blank);
  return `COALESCE(json_extract(${element}, '${path}'), ${blank})`;
}

// The rows, written under the next serials. `rows` carry everything except
// their ids, which only the database knows.
export async function sqlAddJangadRows(
  rows: JangadRow[],
  idTemplate: string
): Promise<JangadRow[]> {
  if (rows.length === 0) return [];

  const names = columnNames(JANGAD_ROW_COLUMNS);
  const params: unknown[] = [];
  // The serial each row is issued under: the number the counter now stands at,
  // less the batch, plus this element's place in the batch. json_each numbers
  // the elements of the array from zero in order, so the first row of the batch
  // takes the first of the serials.
  const serial = "c.value - ? + r.key + 1";
  const picks = JANGAD_ROW_COLUMNS.map((column) => {
    if (column.primaryKey) {
      params.push(idTemplate, rows.length);
      return `printf(?, ${serial})`;
    }
    return pickFrom(column, "r.value");
  });
  // And the same id inside the stored record, so the row and the record it
  // holds can never disagree about which entry this is.
  params.push(idTemplate, rows.length);
  picks.push(`json_set(r.value, '$.id', printf(?, ${serial}))`);
  params.push(JSON.stringify(rows), JANGAD_SEQ);

  const results = await sqlBatch<{ doc: string }>([
    {
      query: `INSERT INTO ${JANGAD_COUNTER_TABLE} (counter_key, value) VALUES (?, ?)
ON CONFLICT(counter_key) DO UPDATE SET value = value + ?`,
      params: [JANGAD_SEQ, rows.length, rows.length],
    },
    {
      query: `INSERT INTO ${JANGAD_TABLE} (${names.join(", ")})
SELECT ${picks.join(", ")}
FROM json_each(?) AS r, ${JANGAD_COUNTER_TABLE} c WHERE c.counter_key = ?
RETURNING doc`,
      params,
    },
  ]);

  const written = results[1]?.results || [];
  if (written.length !== rows.length) {
    // The transaction either wrote the batch or it did not. There is no
    // half-written batch to repair, so this is a failure to report rather than
    // a state to tidy up.
    throw new Error(
      "The entries were not saved, so no register numbers were taken. Nothing was changed."
    );
  }
  // Back in the order they were sent, which is the order the serials were
  // issued in. A database is under no obligation to return rows in the order it
  // wrote them, and the caller's next move depends on this order: the PD sheet
  // is marked in production from it, and the receipt chase is closed from it.
  return written
    .map(parseDoc)
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

// --- Changing a row ----------------------------------------------------------

// The columns a patch may write: the ones that are cells of the workbook.
//
// Worked out from the column list rather than written down again, so a column
// added there is covered here without anybody remembering to. id, run_no and
// created_at are facts about the entry rather than cells in it, and a save does
// not touch them.
const PATCH_COLUMNS = JANGAD_ROW_COLUMNS.filter(
  (column) => (JANGAD_FIELDS as string[]).includes(column.path.slice(2))
);

const PATCH_FIELDS = PATCH_COLUMNS.map((column) => column.path.slice(2) as JangadField);

type Patch = Partial<Record<JangadField, string>>;

// One row, changed in place. One statement, one row read, one row written,
// whatever the register has grown to.
//
// The record in `doc` is corrected inside the database with json_patch rather
// than read out, changed and put back: the row is already there and the portal
// has no reason to see it. json_patch merges the cells that were sent over the
// ones that are stored, which is the same merge the R2 version does by spreading
// one object over another, down to a cleared cell being a blank that overwrites
// rather than a field that disappears.
//
// Nothing comes back when there is no such entry, which is how "not found"
// reaches the screen as a 404 instead of a save that silently did nothing.
export async function sqlUpdateJangadRow(
  id: string,
  patch: Patch,
  at: string
): Promise<JangadRow | null> {
  const sets = PATCH_COLUMNS.map((column) => `${column.name} = ?`);
  const params: unknown[] = PATCH_FIELDS.map((field) => patch[field] ?? "");
  params.push(at, JSON.stringify(patch), at, id);

  const { rows } = await sqlRun(
    `UPDATE ${JANGAD_TABLE} SET ${sets.join(", ")}, updated_at = ?,
  doc = json_set(json_patch(doc, json(?)), '$.updatedAt', ?)
WHERE id = ? RETURNING doc`,
    params
  );
  const written = rows as { doc: string }[];
  return written.length ? parseDoc(written[0]) : null;
}

// A screenful at once: the accountant fills in a whole design's rows and presses
// save once.
//
// One statement however many rows, for the same reason the batch insert is one
// statement. The patches go in as a JSON array and SQLite joins them to the
// register on the id, so forty edited lines cost one query and forty rows
// written, not forty queries.
//
// A patch naming an entry that is not there matches nothing and is passed over,
// which is what the R2 version does with an id it cannot find.
export async function sqlUpdateJangadRows(
  patches: { id: string; row: Patch }[],
  at: string
): Promise<JangadRow[]> {
  if (patches.length === 0) return [];

  // Each patch is {id, row}, so a cell of it is reached one step further in.
  const sets = PATCH_COLUMNS.map(
    (column) => `${column.name} = ${pickFrom(column, "p.value", `$.row${column.path.slice(1)}`)}`
  );

  const { rows } = await sqlRun(
    `UPDATE ${JANGAD_TABLE} SET ${sets.join(", ")}, updated_at = ?,
  doc = json_set(json_patch(${JANGAD_TABLE}.doc, json_extract(p.value, '$.row')), '$.updatedAt', ?)
FROM json_each(?) AS p
WHERE ${JANGAD_TABLE}.id = json_extract(p.value, '$.id')
RETURNING doc`,
    [at, at, JSON.stringify(patches)]
  );
  return (rows as { doc: string }[]).map(parseDoc);
}

export async function sqlDeleteJangadRow(id: string): Promise<boolean> {
  const { changes } = await sqlRun(`DELETE FROM ${JANGAD_TABLE} WHERE id = ?`, [id]);
  return changes > 0;
}

// --- The running number, and the flag ----------------------------------------

// What the register stands at, for the backup's own copy of the document. The
// number is not taken here: a save takes its own, inside its own transaction.
export async function sqlJangadSeq(): Promise<number> {
  const row = await sqlFirst<{ value: number }>(
    `SELECT value FROM ${JANGAD_COUNTER_TABLE} WHERE counter_key = ?`,
    [JANGAD_SEQ]
  );
  const n = Number(row?.value);
  return isFinite(n) ? n : 0;
}

// The number set outright, which only the copy may do. Afterwards it only ever
// goes up, inside the transaction that uses it.
//
// MAX rather than a plain assignment: a number already in D1 that has gone
// further than the R2 document's belongs to rows written here since, and winding
// it back would hand out a serial that is already on an entry.
export async function sqlSetJangadSeq(value: number): Promise<void> {
  await sqlRun(
    `INSERT INTO ${JANGAD_COUNTER_TABLE} (counter_key, value) VALUES (?, ?)
ON CONFLICT(counter_key) DO UPDATE SET value = MAX(${JANGAD_COUNTER_TABLE}.value, excluded.value)`,
    [JANGAD_SEQ, value]
  );
}

export async function sqlSetJangadFlag(flag: string, value = 1): Promise<void> {
  await sqlRun(
    `INSERT INTO ${JANGAD_FLAG_TABLE} (flag, value) VALUES (?, ?)
ON CONFLICT(flag) DO UPDATE SET value = excluded.value`,
    [flag, value]
  );
}

// The ids the register already holds, so a copy that has to be run more than
// once can leave out what is already across instead of offering it again.
export async function sqlJangadIds(): Promise<Set<string>> {
  const rows = await sqlAll<{ id: string }>(`SELECT id FROM ${JANGAD_TABLE}`);
  return new Set(rows.map((row) => String(row.id)));
}

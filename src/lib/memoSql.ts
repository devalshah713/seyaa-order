// The memo module, in SQL.
//
// Everything here is the D1 half of memoStore.ts. The store itself decides
// which half to use; this file never does. It holds the queries and the two
// translations either side of them: a record in, a row out.
//
// Three rules shape all of it.
//
// One: a save is one row. That is the whole reason for the move, so nothing in
// here reads a book of memos in order to add one to it.
//
// Two: fifty queries per request, and never a query per record. Where several
// records have to go in at once the whole chunk is handed to one statement as
// JSON and SQLite expands it, so copying a hundred events costs one query
// rather than a hundred.
//
// Three: a number, once taken, is never taken twice and never skipped. See
// takeNextNumber() for how, which is the only genuinely subtle thing in the
// file.
import "server-only";
import { sqlAll, sqlBatch, sqlFirst, sqlRun } from "./sql";
import {
  COUNTER_TABLE,
  EVENT_COLUMNS,
  EVENT_TABLE,
  FLAG_TABLE,
  MEMO_COLUMNS,
  MEMO_TABLE,
  ORDER_COLUMNS,
  ORDER_TABLE,
  PARTY_COLUMNS,
  PARTY_TABLE,
  columnNames,
  columnValues,
  type SqlColumn,
} from "./sqlSchema";
import type { Party, StockEvent } from "./memoFormat";
import type { Memo, MemoItem, GoldItem, Order } from "./memoStore";

// --- Writing records ---------------------------------------------------------

// One whole record, written as one row. Used for a save and for an edit alike:
// the record carries its own id, so there is nothing to decide.
//
// OR REPLACE rather than an upsert clause because every column is written every
// time. There is no half-update to merge, and nothing else in the row to
// preserve.
function putRowCall<T>(table: string, columns: SqlColumn<T>[], record: T) {
  const names = columnNames(columns);
  const marks = names.map(() => "?").join(", ");
  return {
    query: `INSERT OR REPLACE INTO ${table} (${names.join(", ")}) VALUES (${marks})`,
    params: columnValues(columns, record),
  };
}

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
  const picks = columns.map((column) => {
    const blank = typeof column.blank === "string" ? `'${column.blank}'` : String(column.blank);
    return `COALESCE(json_extract(r.value, '${column.path}'), ${blank})`;
  });
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

// --- Taking the next number --------------------------------------------------
//
// Memo numbers are the business's own serial numbers. SS/26-27/008 must follow
// SS/26-27/007 with nothing missing in between, and two people saving at the
// same moment must never both be given 008.
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
//   2. the memo is written using the value that statement 1 just produced,
//      read back inside the same transaction.
//
// Because it is one transaction, either both happen or neither does. Two saves
// at once become two transactions, and SQLite runs them one after the other:
// the second sees 008 committed and takes 009. No number is shared, and none is
// skipped, because a memo that fails to be written also unwinds the number it
// would have used.
//
// The memo comes back out of the database rather than being assembled here, so
// what the portal shows the person is exactly the row that was stored.

// A number no memo book will ever reach, used to find out how a number is
// printed without writing that format down a second time. memoIdFor() is asked
// to format the sentinel, and the sentinel is swapped for SQLite's own
// three-digit placeholder. If the formats in memoFormat.ts ever change, this
// changes with them.
const SENTINEL = 7777777;

export function numberTemplate(format: (seq: number) => string): string {
  return format(SENTINEL).replace(String(SENTINEL), "%03d");
}

// Where a record's own number lives: which column holds it, and where it sits
// inside the stored record. Memos and orders differ (memoNo against orderNo),
// so it is said once per table rather than written into the query.
type NumberFields = {
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
FROM ${COUNTER_TABLE} c WHERE c.counter_key = ?
RETURNING doc`,
    params,
  };
}

async function takeNextNumber<T>(
  table: string,
  columns: SqlColumn<T>[],
  record: T,
  counterKey: string,
  templates: { id: string; no: string },
  fields: NumberFields
): Promise<T> {
  const results = await sqlBatch<{ doc: string }>([
    {
      query: `INSERT INTO ${COUNTER_TABLE} (counter_key, value) VALUES (?, 1)
ON CONFLICT(counter_key) DO UPDATE SET value = value + 1`,
      params: [counterKey],
    },
    insertWithNumberCall(table, columns, record, templates, fields, counterKey),
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

// --- Memos -------------------------------------------------------------------

// The columns the memo history needs, which is every column except the record
// itself. Rebuilding the memo from these is lossless, because every field a
// memo has is one of them, and it means the list never reads `doc`, so the
// history costs the list's own columns rather than every memo in full.
const MEMO_LIST_COLUMNS = MEMO_COLUMNS.map((column) => column.name).join(", ");

type MemoRow = Record<string, unknown>;

const str = (value: unknown): string => (value === null || value === undefined ? "" : String(value));
const numOf = (value: unknown): number => {
  const n = Number(value);
  return isFinite(n) ? n : 0;
};

function parseArray<T>(value: unknown, what: string): T[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    // A row whose JSON column will not parse is a row written by something
    // other than this portal. Reading it as "no rows on the memo" is the
    // reading normalize() has always given a memo with no items, and it keeps
    // the history drawing instead of failing whole.
    console.error(`A memo's ${what} could not be read as JSON.`);
    return [];
  }
}

export function rowToMemo(row: MemoRow): Memo {
  // The two optional fields are left out altogether rather than set to
  // undefined, so a memo rebuilt from its columns is the same object as the
  // same memo read whole, down to which keys it has.
  const against = str(row.against_memo_no);
  const updated = str(row.updated_at);
  return {
    ...(against ? { againstMemoNo: against } : {}),
    ...(updated ? { updatedAt: updated } : {}),
    id: str(row.id),
    memoNo: str(row.memo_no),
    kind: row.kind === "gold" ? "gold" : "jewellery",
    fy: str(row.fy),
    seq: numOf(row.seq),
    to: str(row.to_party),
    through: str(row.through),
    mobile: str(row.mobile),
    date: str(row.memo_date),
    purpose: str(row.purpose),
    comment: str(row.comment),
    items: parseArray<MemoItem>(row.items, "items"),
    goldItems: parseArray<GoldItem>(row.gold_items, "gold rows"),
    totalPcs: numOf(row.total_pcs),
    totalGrossWt: numOf(row.total_gross_wt),
    totalFineWt: numOf(row.total_fine_wt),
    createdAt: str(row.created_at),
  };
}

function parseDoc<T>(row: { doc: string }): T {
  return JSON.parse(row.doc) as T;
}

export async function sqlListMemos(): Promise<Memo[]> {
  const rows = await sqlAll<{ doc: string }>(
    `SELECT doc FROM ${MEMO_TABLE} ORDER BY created_at DESC`
  );
  return rows.map(parseDoc<Memo>);
}

// The hot one: the memo history, which is the page the office keeps open.
//
// Two queries, neither of which reads a `doc`. The memos come back as their own
// columns and the events whole, because the history needs every event to work
// out each memo's settlement status.
export async function sqlListMemoHistory(): Promise<{ memos: Memo[]; events: StockEvent[] }> {
  const [memos, events] = await Promise.all([
    sqlAll<MemoRow>(`SELECT ${MEMO_LIST_COLUMNS} FROM ${MEMO_TABLE} ORDER BY created_at DESC`),
    sqlAll<{ doc: string }>(`SELECT doc FROM ${EVENT_TABLE} ORDER BY recorded_at`),
  ]);
  return { memos: memos.map(rowToMemo), events: events.map(parseDoc<StockEvent>) };
}

export async function sqlGetMemo(id: string): Promise<Memo | null> {
  const row = await sqlFirst<{ doc: string }>(`SELECT doc FROM ${MEMO_TABLE} WHERE id = ?`, [id]);
  return row ? parseDoc<Memo>(row) : null;
}

// One memo and only its own outcomes. Against the JSON document this read the
// whole book and the whole event list to show one page; here it is two rows and
// a handful.
export async function sqlGetMemoWithEvents(
  id: string
): Promise<{ memo: Memo; events: StockEvent[] } | null> {
  const [memos, events] = await Promise.all([
    sqlAll<{ doc: string }>(`SELECT doc FROM ${MEMO_TABLE} WHERE id = ?`, [id]),
    sqlAll<{ doc: string }>(
      `SELECT doc FROM ${EVENT_TABLE} WHERE memo_id = ? ORDER BY recorded_at`,
      [id]
    ),
  ]);
  if (memos.length === 0) return null;
  return { memo: parseDoc<Memo>(memos[0]), events: events.map(parseDoc<StockEvent>) };
}

export async function sqlListEvents(): Promise<StockEvent[]> {
  const rows = await sqlAll<{ doc: string }>(
    `SELECT doc FROM ${EVENT_TABLE} ORDER BY recorded_at`
  );
  return rows.map(parseDoc<StockEvent>);
}

export async function sqlListOpenIssues(): Promise<
  { memoNo: string; to: string; date: string }[]
> {
  const rows = await sqlAll<{ memo_no: string; to_party: string; memo_date: string }>(
    `SELECT memo_no, to_party, memo_date FROM ${MEMO_TABLE}
WHERE kind = 'gold' AND purpose = ? ORDER BY created_at DESC`,
    ["Issue to Factory"]
  );
  return rows.map((row) => ({ memoNo: row.memo_no, to: row.to_party, date: row.memo_date }));
}

// The memo written under the next number in its book. See takeNextNumber().
export async function sqlCreateMemo(
  memo: Memo,
  counterKey: string,
  templates: { id: string; no: string }
): Promise<Memo> {
  return takeNextNumber(MEMO_TABLE, MEMO_COLUMNS, memo, counterKey, templates, {
    id: { column: "id", path: "$.id" },
    no: { column: "memo_no", path: "$.memoNo" },
    seq: { column: "seq", path: "$.seq" },
  });
}

// An edit: one row replaced by itself with the changes in it.
export async function sqlPutMemo(memo: Memo): Promise<void> {
  const call = putRowCall(MEMO_TABLE, MEMO_COLUMNS, memo);
  await sqlRun(call.query, call.params);
}

// A memo removed. Its stock events are left where they are, exactly as the JSON
// document leaves them: the trail of what became of each piece is not the
// memo's to erase.
export async function sqlDeleteMemo(id: string): Promise<boolean> {
  const { changes } = await sqlRun(`DELETE FROM ${MEMO_TABLE} WHERE id = ?`, [id]);
  return changes > 0;
}

// What is on one memo, for checking a stock number belongs to it before an
// outcome is recorded against it.
export async function sqlMemoItems(
  id: string
): Promise<{ memoNo: string; items: MemoItem[] } | null> {
  const row = await sqlFirst<{ memo_no: string; items: string }>(
    `SELECT memo_no, items FROM ${MEMO_TABLE} WHERE id = ?`,
    [id]
  );
  if (!row) return null;
  return { memoNo: str(row.memo_no), items: parseArray<MemoItem>(row.items, "items") };
}

// Every memo's stock rows, for the stock ledger. The smallest set of columns
// that can answer "where has this piece been": no `doc`, no gold rows, no
// recipient details.
export type StockMemoRow = {
  id: string;
  memoNo: string;
  kind: "jewellery" | "gold";
  to: string;
  date: string;
  items: MemoItem[];
};

export async function sqlMemosWithItems(like?: string): Promise<StockMemoRow[]> {
  // The LIKE is only a way of not reading rows that cannot match. A stock
  // number is stored as an element of a JSON array, so it is always written
  // between quotation marks, and matching on the quoted form is what keeps
  // A140 from matching A1405. Whether a row really matches is decided properly
  // afterwards, by the same code the JSON store uses, so narrowing here can
  // only ever save work and never change an answer.
  const where = like ? `WHERE items LIKE ?` : "";
  const params = like ? [`%"${like}"%`] : [];
  const rows = await sqlAll<MemoRow>(
    `SELECT id, memo_no, kind, to_party, memo_date, items FROM ${MEMO_TABLE} ${where} ORDER BY memo_date`,
    params
  );
  return rows.map((row) => ({
    id: str(row.id),
    memoNo: str(row.memo_no),
    kind: row.kind === "gold" ? "gold" : "jewellery",
    to: str(row.to_party),
    date: str(row.memo_date),
    items: parseArray<MemoItem>(row.items, "items"),
  }));
}

// --- Stock events ------------------------------------------------------------

// Outcomes are only ever added, so this is an insert and never an update. One
// query however many pieces were settled at once.
export async function sqlAddEvents(events: StockEvent[]): Promise<void> {
  await insertRows(EVENT_TABLE, EVENT_COLUMNS, events);
}

export async function sqlEventsForStock(stockNo: string): Promise<StockEvent[]> {
  const rows = await sqlAll<{ doc: string }>(
    `SELECT doc FROM ${EVENT_TABLE} WHERE stock_no = ? ORDER BY recorded_at`,
    [stockNo]
  );
  return rows.map(parseDoc<StockEvent>);
}

// --- Parties -----------------------------------------------------------------

// Every list, whole. The lists are small, a few hundred names across all of
// them, and several screens need more than one at a time, so one query for the
// lot beats one query per list.
export async function sqlAllParties(): Promise<Party[]> {
  const rows = await sqlAll<{ doc: string }>(`SELECT doc FROM ${PARTY_TABLE} ORDER BY name`);
  return rows.map(parseDoc<Party>);
}

export async function sqlAddParties(parties: Party[]): Promise<void> {
  await insertRows(PARTY_TABLE, PARTY_COLUMNS, parties);
}

export async function sqlPutParty(party: Party): Promise<void> {
  const call = putRowCall(PARTY_TABLE, PARTY_COLUMNS, party);
  await sqlRun(call.query, call.params);
}

// Several ids at once as one statement with an IN list, because a list being
// emptied can be fifty names and fifty queries is the whole allowance.
export async function sqlDeleteParties(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const marks = ids.map(() => "?").join(", ");
  const { changes } = await sqlRun(
    `DELETE FROM ${PARTY_TABLE} WHERE id IN (${marks})`,
    ids
  );
  return changes;
}

// Who memos have been written to, and how many each. The recipient column
// only, never the memos themselves: this answers both "may this party be
// removed" and "which typed names are not on the list".
export async function sqlRecipientCounts(): Promise<{ to: string; memos: number }[]> {
  const rows = await sqlAll<{ to_party: string; memos: number }>(
    `SELECT to_party, COUNT(*) AS memos FROM ${MEMO_TABLE} GROUP BY to_party`
  );
  return rows.map((row) => ({ to: str(row.to_party), memos: numOf(row.memos) }));
}

// Put every memo written to one of these spellings onto the name the list
// holds.
//
// One statement, however many memos. The stored record is corrected in the
// database with json_set rather than read out, changed and written back: there
// is no reason to bring a hundred memos into the portal to change one word in
// each.
export async function sqlReplaceRecipient(
  from: string[],
  to: string,
  at: string
): Promise<number> {
  if (from.length === 0) return 0;
  const marks = from.map(() => "?").join(", ");
  const { changes } = await sqlRun(
    `UPDATE ${MEMO_TABLE}
SET to_party = ?,
    updated_at = ?,
    doc = json_set(json_set(doc, '$.to', ?), '$.updatedAt', ?)
WHERE to_party IN (${marks})`,
    [to, at, to, at, ...from]
  );
  return changes;
}

// --- Orders ------------------------------------------------------------------

export async function sqlListOrders(): Promise<Order[]> {
  const rows = await sqlAll<{ doc: string }>(
    `SELECT doc FROM ${ORDER_TABLE} ORDER BY created_at DESC`
  );
  return rows.map(parseDoc<Order>);
}

export async function sqlGetOrder(id: string): Promise<Order | null> {
  const row = await sqlFirst<{ doc: string }>(`SELECT doc FROM ${ORDER_TABLE} WHERE id = ?`, [id]);
  return row ? parseDoc<Order>(row) : null;
}

export async function sqlCreateOrder(
  order: Order,
  counterKey: string,
  templates: { id: string; no: string }
): Promise<Order> {
  return takeNextNumber(ORDER_TABLE, ORDER_COLUMNS, order, counterKey, templates, {
    id: { column: "id", path: "$.id" },
    no: { column: "order_no", path: "$.orderNo" },
    seq: { column: "seq", path: "$.seq" },
  });
}

export async function sqlPutOrder(order: Order): Promise<void> {
  const call = putRowCall(ORDER_TABLE, ORDER_COLUMNS, order);
  await sqlRun(call.query, call.params);
}

export async function sqlDeleteOrder(id: string): Promise<boolean> {
  const { changes } = await sqlRun(`DELETE FROM ${ORDER_TABLE} WHERE id = ?`, [id]);
  return changes > 0;
}

// --- Counters and flags ------------------------------------------------------

export async function sqlCounters(): Promise<Record<string, number>> {
  const rows = await sqlAll<{ counter_key: string; value: number }>(
    `SELECT counter_key, value FROM ${COUNTER_TABLE}`
  );
  const out: Record<string, number> = {};
  for (const row of rows) out[str(row.counter_key)] = numOf(row.value);
  return out;
}

// The serial a book stands at, for the live preview on the memo form. Nothing
// is taken: the next save takes its own number, and if somebody else saves
// first the preview was a guess and the saved memo is right.
export async function sqlCounter(counterKey: string): Promise<number> {
  const row = await sqlFirst<{ value: number }>(
    `SELECT value FROM ${COUNTER_TABLE} WHERE counter_key = ?`,
    [counterKey]
  );
  return row ? numOf(row.value) : 0;
}

// Counters set outright, for the copy. The copy is the only thing that may do
// this: afterwards a counter only ever goes up, by one, inside the transaction
// that uses the number.
export async function sqlSetCounters(counters: Record<string, number>): Promise<void> {
  const entries = Object.entries(counters);
  if (entries.length === 0) return;
  // One statement for the lot, as JSON, rather than one per book.
  //
  // The WHERE is not a filter and cannot be dropped: SQLite refuses to parse an
  // ON CONFLICT clause on an INSERT that selects its rows unless the SELECT has
  // one, because without it "DO" could be read as a table alias.
  await sqlRun(
    `INSERT INTO ${COUNTER_TABLE} (counter_key, value)
SELECT json_extract(r.value, '$[0]'), json_extract(r.value, '$[1]')
FROM json_each(?) AS r WHERE true
ON CONFLICT(counter_key) DO UPDATE SET value = MAX(${COUNTER_TABLE}.value, excluded.value)`,
    [JSON.stringify(entries)]
  );
}

export async function sqlFlags(): Promise<Record<string, number>> {
  const rows = await sqlAll<{ flag: string; value: number }>(
    `SELECT flag, value FROM ${FLAG_TABLE}`
  );
  const out: Record<string, number> = {};
  for (const row of rows) out[str(row.flag)] = numOf(row.value);
  return out;
}

export async function sqlSetFlag(flag: string, value = 1): Promise<void> {
  await sqlRun(
    `INSERT INTO ${FLAG_TABLE} (flag, value) VALUES (?, ?)
ON CONFLICT(flag) DO UPDATE SET value = excluded.value`,
    [flag, value]
  );
}

// --- Counting, for the admin screen ------------------------------------------

export async function sqlRecordCounts(): Promise<{
  memos: number;
  events: number;
  orders: number;
  parties: number;
}> {
  // One query rather than four, so checking what is where costs the same as
  // asking one question.
  const row = await sqlFirst<{ memos: number; events: number; orders: number; parties: number }>(
    `SELECT
  (SELECT COUNT(*) FROM ${MEMO_TABLE}) AS memos,
  (SELECT COUNT(*) FROM ${EVENT_TABLE}) AS events,
  (SELECT COUNT(*) FROM ${ORDER_TABLE}) AS orders,
  (SELECT COUNT(*) FROM ${PARTY_TABLE}) AS parties`
  );
  return {
    memos: numOf(row?.memos),
    events: numOf(row?.events),
    orders: numOf(row?.orders),
    parties: numOf(row?.parties),
  };
}

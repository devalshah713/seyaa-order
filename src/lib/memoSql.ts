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
// takeNextNumber() in sqlRecords.ts for how, which is the only genuinely subtle
// thing in any of this.
//
// Those three rules are the same for every module that has moved, so the
// statements that follow from them live in sqlRecords.ts and are used from here
// rather than written out again. What stays in this file is what is particular
// to memos: which columns, which counters, and the queries the memo screens
// ask.
import "server-only";
import { sqlAll, sqlFirst, sqlRun } from "./sql";
import {
  insertRows,
  keyChunks,
  numberTemplate,
  putRow,
  sqlAllCounters,
  sqlCounterValue,
  sqlSetCounterValues,
  sqlSetFlagValue,
  sqlTableIds,
  stockKeyColumn,
  takeNextNumber,
} from "./sqlRecords";
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
  QUOTATION_COLUMNS,
  QUOTATION_TABLE,
} from "./sqlSchema";
import type { Party, StockEvent } from "./memoFormat";
import type { Memo, MemoItem, GoldItem, Order } from "./memoStore";
import type { Quotation } from "./quotationConfig";

// Where the memo book's counters live, said once and handed to the shared
// numbering. The memo tables keep their own counter table, so a restore of
// another module's counters can never reach these.
const MEMO_COUNTERS = (key: string) => ({ table: COUNTER_TABLE, key });

// Carried on from here so that everything speaking to the memo tables still
// has one place to import from, which is what memoStore and the copy do.
export { insertRows, numberTemplate };

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
  return takeNextNumber(MEMO_TABLE, MEMO_COLUMNS, memo, MEMO_COUNTERS(counterKey), templates, {
    id: { column: "id", path: "$.id" },
    no: { column: "memo_no", path: "$.memoNo" },
    seq: { column: "seq", path: "$.seq" },
  });
}

// An edit: one row replaced by itself with the changes in it.
export async function sqlPutMemo(memo: Memo): Promise<void> {
  await putRow(MEMO_TABLE, MEMO_COLUMNS, memo);
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

// --- Several stock numbers at once, for the audit ----------------------------

// A memo as the audit reads it: the same columns the ledger asks for, plus the
// purpose, because what a piece went out *for* is half the answer to where it
// is. Its own type rather than StockMemoRow with a field added, so the ledger
// keeps reading exactly what it always has.
export type MemoStockRow = {
  id: string;
  memoNo: string;
  kind: "jewellery" | "gold";
  to: string;
  date: string;
  purpose: string;
  items: MemoItem[];
};

function toMemoStockRow(row: MemoRow): MemoStockRow {
  return {
    id: str(row.id),
    memoNo: str(row.memo_no),
    kind: row.kind === "gold" ? "gold" : "jewellery",
    to: str(row.to_party),
    date: str(row.memo_date),
    purpose: str(row.purpose),
    items: parseArray<MemoItem>(row.items, "items"),
  };
}

// Every memo that mentions any of these stock numbers, in one statement for
// the whole list rather than one per number.
//
// The database takes each memo's stock rows apart with json_each and compares
// each number by the audit's own rule, so a number written in lower case or
// with a dash in it is still found. Matching the stored text instead — which is
// what the single-number ledger does — would miss those, and here the question
// is being asked of a list somebody typed.
//
// Which memos really match is still settled afterwards by linesFor(), over the
// same items, exactly as the ledger settles it.
export async function sqlMemosWithStockNos(keys: string[]): Promise<MemoStockRow[]> {
  if (keys.length === 0) return [];
  const found = new Map<string, MemoStockRow>();
  for (const chunk of keyChunks(keys)) {
    const marks = chunk.map(() => "?").join(", ");
    const rows = await sqlAll<MemoRow>(
      `SELECT id, memo_no, kind, to_party, memo_date, purpose, items
FROM ${MEMO_TABLE}
WHERE EXISTS (
  SELECT 1
  FROM json_each(CASE WHEN json_valid(items) THEN items ELSE '[]' END) AS it,
       json_each(CASE WHEN json_valid(json_extract(it.value, '$.stockNos'))
                      THEN json_extract(it.value, '$.stockNos') ELSE '[]' END) AS s
  WHERE ${stockKeyColumn("s.value")} IN (${marks})
)
ORDER BY memo_date`,
      chunk
    );
    for (const row of rows) {
      const memo = toMemoStockRow(row);
      found.set(memo.id, memo);
    }
  }
  return [...found.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

// The outcomes recorded against any of these stock numbers.
//
// Only these numbers' own events are wanted: linesFor() looks up one stock
// number at a time, so another piece's outcomes on the same memo change
// nothing and are not worth reading.
export async function sqlEventsForStockNos(keys: string[]): Promise<StockEvent[]> {
  if (keys.length === 0) return [];
  const out: StockEvent[] = [];
  for (const chunk of keyChunks(keys)) {
    const marks = chunk.map(() => "?").join(", ");
    const rows = await sqlAll<{ doc: string }>(
      `SELECT doc FROM ${EVENT_TABLE}
WHERE ${stockKeyColumn("stock_no")} IN (${marks}) ORDER BY recorded_at`,
      chunk
    );
    out.push(...rows.map(parseDoc<StockEvent>));
  }
  return out;
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
  await putRow(PARTY_TABLE, PARTY_COLUMNS, party);
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
  return takeNextNumber(ORDER_TABLE, ORDER_COLUMNS, order, MEMO_COUNTERS(counterKey), templates, {
    id: { column: "id", path: "$.id" },
    no: { column: "order_no", path: "$.orderNo" },
    seq: { column: "seq", path: "$.seq" },
  });
}

export async function sqlPutOrder(order: Order): Promise<void> {
  await putRow(ORDER_TABLE, ORDER_COLUMNS, order);
}

export async function sqlDeleteOrder(id: string): Promise<boolean> {
  const { changes } = await sqlRun(`DELETE FROM ${ORDER_TABLE} WHERE id = ?`, [id]);
  return changes > 0;
}

// --- Quotations --------------------------------------------------------------
//
// The same four statements an order needs, against the quotation book's own
// table and its own counter. Nothing is shared but the counter table, and the
// keys in it cannot collide: an order counts under "O:26-27" and a quotation
// under "Q:26-27".

export async function sqlListQuotations(): Promise<Quotation[]> {
  const rows = await sqlAll<{ doc: string }>(
    `SELECT doc FROM ${QUOTATION_TABLE} ORDER BY created_at DESC`
  );
  return rows.map(parseDoc<Quotation>);
}

export async function sqlGetQuotation(id: string): Promise<Quotation | null> {
  const row = await sqlFirst<{ doc: string }>(
    `SELECT doc FROM ${QUOTATION_TABLE} WHERE id = ?`,
    [id]
  );
  return row ? parseDoc<Quotation>(row) : null;
}

// The quotation written under the next number in its book, taken by the
// database inside the same transaction that writes the row. See
// takeNextNumber(): two quotations saved in the very same moment cannot be
// given one number, and neither can a number be skipped.
export async function sqlCreateQuotation(
  quotation: Quotation,
  counterKey: string,
  templates: { id: string; no: string }
): Promise<Quotation> {
  return takeNextNumber(
    QUOTATION_TABLE, QUOTATION_COLUMNS, quotation, MEMO_COUNTERS(counterKey), templates,
    {
      id: { column: "id", path: "$.id" },
      no: { column: "quotation_no", path: "$.quotationNo" },
      seq: { column: "seq", path: "$.seq" },
    }
  );
}

export async function sqlPutQuotation(quotation: Quotation): Promise<void> {
  await putRow(QUOTATION_TABLE, QUOTATION_COLUMNS, quotation);
}

export async function sqlDeleteQuotation(id: string): Promise<boolean> {
  const { changes } = await sqlRun(`DELETE FROM ${QUOTATION_TABLE} WHERE id = ?`, [id]);
  return changes > 0;
}

// --- Counters and flags ------------------------------------------------------
//
// The memo book's own two tables. The statements are the shared ones, named
// here with the table filled in, so a reader of memoStore still finds the
// memo-shaped function it calls.

export async function sqlCounters(): Promise<Record<string, number>> {
  return sqlAllCounters(COUNTER_TABLE);
}

// The serial a book stands at, for the live preview on the memo form. Nothing
// is taken: the next save takes its own number, and if somebody else saves
// first the preview was a guess and the saved memo is right.
export async function sqlCounter(counterKey: string): Promise<number> {
  return sqlCounterValue(COUNTER_TABLE, counterKey);
}

// Counters set outright, for the copy. The copy is the only thing that may do
// this: afterwards a counter only ever goes up, by one, inside the transaction
// that uses the number.
export async function sqlSetCounters(counters: Record<string, number>): Promise<void> {
  await sqlSetCounterValues(COUNTER_TABLE, counters);
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
  await sqlSetFlagValue(FLAG_TABLE, flag, value);
}

// --- Counting, for the admin screen ------------------------------------------

// The ids one table already holds, so a copy that has to be run more than once
// can leave out what is already across instead of offering it again. One
// column, one query, and only asked for when the table is not empty.
export async function sqlExistingIds(table: string): Promise<Set<string>> {
  return sqlTableIds(table);
}

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

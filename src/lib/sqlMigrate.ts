// Copying the memo records out of the R2 document and into D1.
//
// The same shape as dbMigrate.ts, which moved every document out of the old
// Vercel store: look first, copy second, and never anything else.
//
//   * Nothing is written to R2 and nothing anywhere is deleted. The document
//     stays exactly as it is, which is what makes the move abandonable: until
//     the flag at the end is set, the portal is still reading R2.
//   * A record already in D1 is left alone rather than overwritten, so running
//     the copy twice changes nothing the second time, and a copy interrupted
//     half way is finished by running it again rather than started over.
//   * The flag that makes D1 the live store is set last, and only when every
//     record is across. Until then there is no half-moved state to be in.
//
// --- Fifty queries ---------------------------------------------------------
//
// A Worker request may run 50 queries on the free plan, so the copy is written
// never to need one per record. Each chunk of records goes in as a single JSON
// array which SQLite expands into rows, so a hundred memos cost one query. The
// chunks are sized by how much text they carry rather than by how many records,
// because a memo with three hundred stock numbers on it is not the same size as
// a memo with one.
//
// If the records are too many for one request, the copy stops while it is still
// inside its allowance and says how far it got. Pressing the button again
// carries on from there, because everything already across is skipped.
import "server-only";
import { hasR2 } from "./db";
import { hasSql, MAX_QUERIES_PER_REQUEST } from "./sql";
import {
  EVENT_COLUMNS,
  EVENT_TABLE,
  MEMOS_FILLED,
  MEMO_COLUMNS,
  MEMO_TABLE,
  ORDER_COLUMNS,
  ORDER_TABLE,
  PARTY_COLUMNS,
  PARTY_TABLE,
  applyMemoSchema,
  memosAreInSql,
  type SqlColumn,
} from "./sqlSchema";
import { insertRows, sqlRecordCounts, sqlSetCounters, sqlSetFlag } from "./memoSql";
import { normalizeMemo, readMemoDoc, type DB, type Memo, type Order } from "./memoStore";
import { PARTY_KINDS, type Party, type PartyKind, type StockEvent } from "./memoFormat";

// How much record text one statement carries. Comfortably inside what D1
// accepts for a single bound value, and small enough that a chunk that fails
// has not taken much with it.
const CHUNK_BYTES = 48_000;

// How many of the fifty statements a request is allowed may go on copying
// records. The rest of the run needs the others, and the worst case is the
// first press, which also makes the tables: asking whether the schema is there
// (1), making it (14), counting before and after (2), the running numbers (1),
// up to one flag per controlled list (7) and the flag at the end (1). That is
// 26, so the records get what is left.
const QUERY_BUDGET = MAX_QUERIES_PER_REQUEST - 26;

export type RecordCounts = {
  memos: number;
  events: number;
  orders: number;
  parties: number;
};

export type SqlCheck = {
  // Whether the question could be answered at all, and why not if it could not.
  hint: string;
  r2: RecordCounts;
  sql: RecordCounts;
  // Is D1 the live store for memos yet?
  live: boolean;
};

export type CopyReport = {
  at: string;
  // What went in, per kind of record.
  copied: RecordCounts;
  // What was already there and so left alone.
  skipped: RecordCounts;
  // True when every record is across and D1 is now the live store.
  finished: boolean;
  // Plain words for the screen.
  notes: string[];
};

export function sqlMigrationHint(): string {
  if (!hasSql()) {
    return "There is no Cloudflare database attached to this portal yet, so there is nowhere to copy the records to. Until there is, everything keeps running on the R2 files exactly as before.";
  }
  if (!hasR2()) {
    return "The R2 files are not configured, so there is nothing to copy from.";
  }
  return "";
}

function countOf(doc: Partial<DB>): RecordCounts {
  return {
    memos: (doc.memos || []).length,
    events: (doc.events || []).length,
    orders: (doc.orders || []).length,
    parties: (doc.parties || []).length,
  };
}

// What is where, without changing anything. Worth looking at before pressing
// the button, and again afterwards.
export async function checkMemoStores(): Promise<SqlCheck> {
  const hint = sqlMigrationHint();
  const empty: RecordCounts = { memos: 0, events: 0, orders: 0, parties: 0 };
  if (hint) return { hint, r2: empty, sql: empty, live: false };

  const doc = await readMemoDoc();
  // The tables have to exist before they can be counted, and making them is
  // safe to repeat.
  await applyMemoSchema();
  return {
    hint: "",
    r2: countOf(doc),
    sql: await sqlRecordCounts(),
    live: await memosAreInSql(),
  };
}

// Records split into chunks small enough for one statement each.
function chunked<T>(records: T[]): T[][] {
  const chunks: T[][] = [];
  let chunk: T[] = [];
  let bytes = 0;
  for (const record of records) {
    const size = JSON.stringify(record).length;
    // A single record larger than a whole chunk still goes, on its own: better
    // one oversized statement than a record left behind.
    if (chunk.length && bytes + size > CHUNK_BYTES) {
      chunks.push(chunk);
      chunk = [];
      bytes = 0;
    }
    chunk.push(record);
    bytes += size;
  }
  if (chunk.length) chunks.push(chunk);
  return chunks;
}

// One kind of record, as far as the query budget allows.
async function copyKind<T>(
  table: string,
  columns: SqlColumn<T>[],
  records: T[],
  budget: { left: number }
): Promise<{ copied: number; remaining: number }> {
  let copied = 0;
  for (const chunk of chunked(records)) {
    if (budget.left <= 0) break;
    await insertRows(table, columns, chunk);
    budget.left--;
    copied += chunk.length;
  }
  return { copied, remaining: records.length - copied };
}

// Copy the memo records across.
//
// Reads the R2 document, puts everything it holds into D1, and sets the flag
// that makes D1 the live store once the two agree. Safe to run again at any
// point.
export async function copyMemosToSql(): Promise<CopyReport> {
  const hint = sqlMigrationHint();
  if (hint) throw new Error(hint);

  const report: CopyReport = {
    at: new Date().toISOString(),
    copied: { memos: 0, events: 0, orders: 0, parties: 0 },
    skipped: { memos: 0, events: 0, orders: 0, parties: 0 },
    finished: false,
    notes: [],
  };

  await applyMemoSchema();

  const doc = await readMemoDoc();
  const inR2 = countOf(doc);
  const before = await sqlRecordCounts();

  // Memos go in filled out the way every read fills them out, so a memo
  // written before gold existed has its kind and its empty gold rows in the
  // database rather than being patched up on the way out again.
  const memos = (doc.memos || []).map(normalizeMemo) as Memo[];
  const events = (doc.events || []) as StockEvent[];
  const orders = (doc.orders || []) as Order[];
  const parties = (doc.parties || []) as Party[];

  const budget = { left: QUERY_BUDGET };
  const memoResult = await copyKind(MEMO_TABLE, MEMO_COLUMNS, memos, budget);
  const eventResult = await copyKind(EVENT_TABLE, EVENT_COLUMNS, events, budget);
  const orderResult = await copyKind(ORDER_TABLE, ORDER_COLUMNS, orders, budget);
  const partyResult = await copyKind(PARTY_TABLE, PARTY_COLUMNS, parties, budget);

  // The running numbers. Without these the next memo saved in D1 would start
  // the book again at 001, so they go across before anything is switched over.
  // A counter already in D1 that has gone further is left where it is.
  await sqlSetCounters(doc.counters || {});

  // Which built-in lists have already been written in. Carried across so a list
  // the office cleared out before the move stays cleared after it.
  for (const kind of PARTY_KINDS.map((k) => k.key as PartyKind)) {
    const seeded = doc.seeded?.[kind] || (kind === "mfg" && doc.mfgSeeded);
    if (seeded) await sqlSetFlag(`seeded:${kind}`);
  }

  // What actually went in, counted from the rows that appeared rather than from
  // what the statements were handed: a record already there is ignored, not
  // written, and saying otherwise would make the second run look like work.
  const after = await sqlRecordCounts();
  report.copied = {
    memos: Math.max(0, after.memos - before.memos),
    events: Math.max(0, after.events - before.events),
    orders: Math.max(0, after.orders - before.orders),
    parties: Math.max(0, after.parties - before.parties),
  };
  report.skipped = {
    memos: Math.max(0, memoResult.copied - report.copied.memos),
    events: Math.max(0, eventResult.copied - report.copied.events),
    orders: Math.max(0, orderResult.copied - report.copied.orders),
    parties: Math.max(0, partyResult.copied - report.copied.parties),
  };

  const left =
    memoResult.remaining + eventResult.remaining + orderResult.remaining + partyResult.remaining;

  if (left > 0) {
    report.notes.push(
      `There are more records than one run may copy, so ${left.toLocaleString()} are still to go. Press the button again to carry on. Nothing already copied is copied twice.`
    );
    return report;
  }

  // Every record is across only if the database now holds at least as many of
  // each as the R2 document does. Anything less and the flag stays off, because
  // the flag is what sends the office to D1.
  const complete =
    after.memos >= inR2.memos &&
    after.events >= inR2.events &&
    after.orders >= inR2.orders &&
    after.parties >= inR2.parties;

  if (!complete) {
    report.notes.push(
      "The copy ran, but the database does not hold as many records as the R2 files do, so the portal is still reading R2. Press Check to see the two side by side."
    );
    return report;
  }

  await sqlSetFlag(MEMOS_FILLED);
  report.finished = true;
  report.notes.push(
    `All ${inR2.memos.toLocaleString()} memos, ${inR2.events.toLocaleString()} stock entries, ${inR2.orders.toLocaleString()} orders and ${inR2.parties.toLocaleString()} list names are in the database, and the portal is now reading memos from it. The R2 files have not been touched and still hold everything as it was today.`
  );
  return report;
}

// Copying records out of the R2 documents and into D1: the memo book first,
// then the jangad register, the PD sheets, the demands and the stock book,
// each at the foot of the one before it.
//
// All five are separate moves with a Check and a Copy each, because they are
// five decisions. The owner presses a pair when he is ready for that book to
// move, in any order, and none of them waits on another.
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
  DEMANDS_FILLED,
  DEMAND_COLUMNS,
  DEMAND_TABLE,
  JANGAD_FILLED,
  JANGAD_ROW_COLUMNS,
  JANGAD_TABLE,
  MEMOS_FILLED,
  MEMO_COLUMNS,
  MEMO_TABLE,
  ORDER_COLUMNS,
  ORDER_TABLE,
  PARTY_COLUMNS,
  PARTY_TABLE,
  PD_COLUMNS,
  PD_FILLED,
  PD_TABLE,
  STOCK_COLUMNS,
  STOCK_FILLED,
  STOCK_TABLE,
  applyDemandSchema,
  applyJangadSchema,
  applyMemoSchema,
  applyPdSchema,
  applyStockSchema,
  demandsAreInSql,
  jangadIsInSql,
  memosAreInSql,
  pdIsInSql,
  stockBookIsInSql,
  type SqlColumn,
} from "./sqlSchema";
import { insertRows, sqlExistingIds, sqlRecordCounts, sqlSetCounters, sqlSetFlag } from "./memoSql";
import { sqlJangadCount, sqlSetJangadFlag, sqlSetJangadSeq } from "./jangadSql";
import {
  flatPdSheet, insertPdSheets, sqlPdCount, sqlSetPdCounters, sqlSetPdFlag,
} from "./pdSql";
import {
  flatDemand, insertDemands, sqlDemandCount, sqlSetDemandCounters, sqlSetDemandFlag,
} from "./demandSql";
import { sqlSetStockCounter, sqlSetStockFlag, sqlStockCount } from "./stockBookSql";
import { normalizeMemo, readMemoDoc, type DB, type Memo, type Order } from "./memoStore";
import { readJangadDoc, type JangadDB } from "./jangadStore";
import { readPdDoc, type PdDB, type PdSheet } from "./pdStore";
import { readDemandDoc, type Demand, type DemandDB } from "./demandStore";
import { readStockBookDoc, type StockBookDB } from "./stockBookStore";
import { PARTY_KINDS, type Party, type PartyKind, type StockEvent } from "./memoFormat";
import type { JangadRow } from "./jangadConfig";
import type { StockEntry } from "./stockBookConfig";

// How much record text one statement carries. Comfortably inside what D1
// accepts for a single bound value, and small enough that a chunk that fails
// has not taken much with it.
const CHUNK_BYTES = 48_000;

// And how much a statement carries when the portal has flattened the records
// first. Half, because a flattened record is the record plus every column taken
// off it, which is a little over twice the text. See insertFlatRows().
const FLAT_CHUNK_BYTES = CHUNK_BYTES / 2;

// How many of the fifty statements a request is allowed may go on copying
// records. The rest of the run needs the others, and the worst case is the
// first press, which also makes the tables: asking whether the schema is there
// (1), making it (16), counting before and after (2), the running numbers (1),
// up to one flag per controlled list (7), the flag at the end (1) and, on a
// second press, one query per kind to find out what is already across (4).
// That is 32, so the records get what is left.
const QUERY_BUDGET = MAX_QUERIES_PER_REQUEST - 32;

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
function chunked<T>(records: T[], limit = CHUNK_BYTES): T[][] {
  const chunks: T[][] = [];
  let chunk: T[] = [];
  let bytes = 0;
  for (const record of records) {
    const size = JSON.stringify(record).length;
    // A single record larger than a whole chunk still goes, on its own: better
    // one oversized statement than a record left behind.
    if (chunk.length && bytes + size > limit) {
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
//
// What the database already holds is left out before anything is sent rather
// than ignored on arrival. The database would ignore it either way, but a
// second run that offered the first run's work again would spend its whole
// allowance on records already across and never reach the ones that are not.
//
// How the records are written is the one thing a module may change. The default
// hands whole records to the database and lets it expand them, which is what the
// memo book and the register do. A table with a column worked out from a record
// rather than read off it cannot be written that way, because there is no JSON
// path to such a column, so the PD sheets and the demands pass a writer that
// flattens each record here first. Either way it is one statement per chunk.
async function copyKind<T extends { id: string }>(
  table: string,
  columns: SqlColumn<T>[],
  records: T[],
  alreadyThere: number,
  budget: { left: number },
  write?: { put: (chunk: T[]) => Promise<void>; chunkBytes: number }
): Promise<{ copied: number; remaining: number; skipped: number }> {
  let todo = records;
  let skipped = 0;
  if (alreadyThere > 0 && records.length > 0) {
    const have = await sqlExistingIds(table);
    budget.left--;
    todo = records.filter((record) => !have.has(record.id));
    skipped = records.length - todo.length;
  }

  let copied = 0;
  for (const chunk of chunked(todo, write ? write.chunkBytes : CHUNK_BYTES)) {
    if (budget.left <= 0) break;
    if (write) await write.put(chunk);
    else await insertRows(table, columns, chunk);
    budget.left--;
    copied += chunk.length;
  }
  return { copied, remaining: todo.length - copied, skipped };
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
  const memoResult = await copyKind(MEMO_TABLE, MEMO_COLUMNS, memos, before.memos, budget);
  const eventResult = await copyKind(EVENT_TABLE, EVENT_COLUMNS, events, before.events, budget);
  const orderResult = await copyKind(ORDER_TABLE, ORDER_COLUMNS, orders, before.orders, budget);
  const partyResult = await copyKind(PARTY_TABLE, PARTY_COLUMNS, parties, before.parties, budget);

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
    memos: memoResult.skipped + Math.max(0, memoResult.copied - report.copied.memos),
    events: eventResult.skipped + Math.max(0, eventResult.copied - report.copied.events),
    orders: orderResult.skipped + Math.max(0, orderResult.copied - report.copied.orders),
    parties: partyResult.skipped + Math.max(0, partyResult.copied - report.copied.parties),
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

// --- The jangad register -----------------------------------------------------
//
// The same move, for the register, and under the same rules: R2 is read and
// never written, nothing anywhere is deleted, a row already across is left
// exactly as it is, and the flag that makes D1 the live store is set last and
// only when every row is there.
//
// It is its own pair of buttons and its own flag. The register was the save that
// was actually failing, so it may well be moved first, and a half-moved portal
// with the memos in one store and the register in the other is a perfectly
// ordinary state for it to be in.

export type JangadCounts = { rows: number };

export type JangadCheck = {
  hint: string;
  r2: JangadCounts;
  sql: JangadCounts;
  // Is D1 the live store for the register yet?
  live: boolean;
};

export type JangadCopyReport = {
  at: string;
  copied: JangadCounts;
  skipped: JangadCounts;
  finished: boolean;
  notes: string[];
};

// How many of the fifty a request is allowed may go on carrying rows. The rest
// of the run needs the others, and the worst case is the first press, which also
// makes the tables: asking whether the schema is there (1), making it (4),
// counting before and after (2), finding out what is already across (1), the
// register's running number (1) and the flag at the end (1). That is 10, and two
// are left spare for the asking.
const JANGAD_QUERY_BUDGET = MAX_QUERIES_PER_REQUEST - 12;

function jangadCountOf(doc: Partial<JangadDB>): JangadCounts {
  return { rows: (doc.rows || []).length };
}

// What is where, without changing anything.
export async function checkJangadStores(): Promise<JangadCheck> {
  const hint = sqlMigrationHint();
  const empty: JangadCounts = { rows: 0 };
  if (hint) return { hint, r2: empty, sql: empty, live: false };

  const doc = await readJangadDoc();
  // The table has to exist before it can be counted, and making it is safe to
  // repeat.
  await applyJangadSchema();
  return {
    hint: "",
    r2: jangadCountOf(doc),
    sql: { rows: await sqlJangadCount() },
    live: await jangadIsInSql(),
  };
}

// Copy the register across.
//
// Reads the R2 document, puts every row it holds into D1, carries the register's
// running number over, and sets the flag that makes D1 the live store once the
// two agree. Safe to run again at any point.
export async function copyJangadToSql(): Promise<JangadCopyReport> {
  const hint = sqlMigrationHint();
  if (hint) throw new Error(hint);

  const report: JangadCopyReport = {
    at: new Date().toISOString(),
    copied: { rows: 0 },
    skipped: { rows: 0 },
    finished: false,
    notes: [],
  };

  await applyJangadSchema();

  const doc = await readJangadDoc();
  const inR2 = jangadCountOf(doc);
  const before = await sqlJangadCount();

  const rows = (doc.rows || []) as JangadRow[];
  const budget = { left: JANGAD_QUERY_BUDGET };
  const result = await copyKind(JANGAD_TABLE, JANGAD_ROW_COLUMNS, rows, before, budget);

  // The register's running number. Without it the next batch saved in D1 would
  // start the register again at JG-00001, writing second entries under numbers
  // that are already on the books. A number already in D1 that has gone further
  // is left where it is.
  //
  // It goes across on every press, not only the last one, because the number
  // belongs with the rows and a copy that stops half way should not leave the
  // database counting from nowhere.
  await sqlSetJangadSeq(doc.seq || 0);

  // What actually went in, counted from the rows that appeared rather than from
  // what the statement was handed: a row already there is ignored, not written.
  const after = await sqlJangadCount();
  report.copied = { rows: Math.max(0, after - before) };
  report.skipped = {
    rows: result.skipped + Math.max(0, result.copied - report.copied.rows),
  };

  if (result.remaining > 0) {
    report.notes.push(
      `There are more entries than one run may copy, so ${result.remaining.toLocaleString()} are still to go. Press the button again to carry on. Nothing already copied is copied twice.`
    );
    return report;
  }

  // Every row is across only if the database now holds at least as many as the
  // R2 document does. Anything less and the flag stays off, because the flag is
  // what sends the office to D1.
  if (after < inR2.rows) {
    report.notes.push(
      "The copy ran, but the database does not hold as many entries as the R2 file does, so the portal is still reading the register from R2. Press Check to see the two side by side."
    );
    return report;
  }

  await sqlSetJangadFlag(JANGAD_FILLED);
  report.finished = true;
  report.notes.push(
    `All ${inR2.rows.toLocaleString()} register entries are in the database, and the portal is now reading the register from it. Saving one entry is one line from here on. The R2 file has not been touched and still holds everything as it was today.`
  );
  return report;
}

// --- The PD sheets -----------------------------------------------------------
//
// The same move, for the design sheets, and under the same rules: R2 is read and
// never written, nothing anywhere is deleted, a sheet already across is left
// exactly as it is, and the flag that makes D1 the live store is set last and
// only when every sheet is there.
//
// Its own pair of buttons and its own flag, so it can be done before or after
// any of the others. A portal with the memos in one store, the register in the
// other and the sheets still in R2 is a perfectly ordinary state for it to be
// in while the owner works through the cards.
//
// One thing is particular to this book. Two of the sheet table's columns hold
// something worked out from a sheet rather than a field of it: how many of its
// pieces reached the stock book, and which of them carry a stock number. There
// is no JSON path to those, so the sheets are flattened here before they are
// sent rather than expanded inside the database. Still one statement per chunk.

export type PdCounts = { sheets: number };

export type PdCheck = {
  hint: string;
  r2: PdCounts;
  sql: PdCounts;
  // Is D1 the live store for the sheets yet?
  live: boolean;
};

export type PdCopyReport = {
  at: string;
  copied: PdCounts;
  skipped: PdCounts;
  finished: boolean;
  notes: string[];
};

// How many of the fifty a request is allowed may go on carrying sheets. The
// rest of the run needs the others, and the worst case is the first press, which
// also makes the tables: asking whether the schema is there (1), making it (4),
// counting before and after (2), finding out what is already across (1), the
// running numbers (1) and the flag at the end (1). That is 10, and two are left
// spare for the asking.
const PD_QUERY_BUDGET = MAX_QUERIES_PER_REQUEST - 12;

function pdCountOf(doc: Partial<PdDB>): PdCounts {
  return { sheets: (doc.sheets || []).length };
}

// What is where, without changing anything.
export async function checkPdStores(): Promise<PdCheck> {
  const hint = sqlMigrationHint();
  const empty: PdCounts = { sheets: 0 };
  if (hint) return { hint, r2: empty, sql: empty, live: false };

  const doc = await readPdDoc();
  // The table has to exist before it can be counted, and making it is safe to
  // repeat.
  await applyPdSchema();
  return {
    hint: "",
    r2: pdCountOf(doc),
    sql: { sheets: await sqlPdCount() },
    live: await pdIsInSql(),
  };
}

// Copy the PD sheets across.
//
// Reads the R2 document, puts every sheet it holds into D1, carries each
// financial year's running number over, and sets the flag that makes D1 the
// live store once the two agree. Safe to run again at any point.
export async function copyPdToSql(): Promise<PdCopyReport> {
  const hint = sqlMigrationHint();
  if (hint) throw new Error(hint);

  const report: PdCopyReport = {
    at: new Date().toISOString(),
    copied: { sheets: 0 },
    skipped: { sheets: 0 },
    finished: false,
    notes: [],
  };

  await applyPdSchema();

  const doc = await readPdDoc();
  const inR2 = pdCountOf(doc);
  const before = await sqlPdCount();

  const sheets = (doc.sheets || []) as PdSheet[];
  const budget = { left: PD_QUERY_BUDGET };
  const result = await copyKind(PD_TABLE, PD_COLUMNS, sheets, before, budget, {
    put: (chunk) => insertPdSheets(chunk.map(flatPdSheet)),
    chunkBytes: FLAT_CHUNK_BYTES,
  });

  // The running numbers, one per financial year. Without them the next sheet
  // saved in D1 would start that year's book again at 001, writing a second
  // sheet under a number that is already on the books. A number already in D1
  // that has gone further is left where it is.
  //
  // They go across on every press, not only the last one, because the numbers
  // belong with the sheets and a copy that stops half way should not leave the
  // database counting from nowhere.
  await sqlSetPdCounters(doc.counters || {});

  // What actually went in, counted from the rows that appeared rather than from
  // what the statements were handed: a sheet already there is ignored, not
  // written, and saying otherwise would make the second run look like work.
  const after = await sqlPdCount();
  report.copied = { sheets: Math.max(0, after - before) };
  report.skipped = {
    sheets: result.skipped + Math.max(0, result.copied - report.copied.sheets),
  };

  if (result.remaining > 0) {
    report.notes.push(
      `There are more sheets than one run may copy, so ${result.remaining.toLocaleString()} are still to go. Press the button again to carry on. Nothing already copied is copied twice.`
    );
    return report;
  }

  // Every sheet is across only if the database now holds at least as many as the
  // R2 document does. Anything less and the flag stays off, because the flag is
  // what sends the office to D1.
  if (after < inR2.sheets) {
    report.notes.push(
      "The copy ran, but the database does not hold as many sheets as the R2 file does, so the portal is still reading the sheets from R2. Press Check to see the two side by side."
    );
    return report;
  }

  await sqlSetPdFlag(PD_FILLED);
  report.finished = true;
  report.notes.push(
    `All ${inR2.sheets.toLocaleString()} PD sheets are in the database, and the portal is now reading them from it. Saving one sheet is one line from here on. The R2 file has not been touched and still holds everything as it was today.`
  );
  return report;
}

// --- The diamond demands -----------------------------------------------------
//
// The same move again, for the demands, and the smallest of the four. Same
// rules: R2 is read and never written, nothing is deleted, a demand already
// across is left as it is, and the flag goes on last.
//
// Three of the demand table's columns hold something worked out from a demand
// rather than a field of it, namely the design numbers on it, the stones it
// counts out and the line of text the list searches, so the demands are
// flattened here before they are sent, as the sheets above are.
//
// The receipt chase is not part of this and is not touched. It keeps its own R2
// document and goes on being read and written there.

export type DemandCounts = { demands: number };

export type DemandCheck = {
  hint: string;
  r2: DemandCounts;
  sql: DemandCounts;
  live: boolean;
};

export type DemandCopyReport = {
  at: string;
  copied: DemandCounts;
  skipped: DemandCounts;
  finished: boolean;
  notes: string[];
};

// The same reckoning as the PD budget above, and the same worst case.
const DEMAND_QUERY_BUDGET = MAX_QUERIES_PER_REQUEST - 12;

function demandCountOf(doc: Partial<DemandDB>): DemandCounts {
  return { demands: (doc.demands || []).length };
}

export async function checkDemandStores(): Promise<DemandCheck> {
  const hint = sqlMigrationHint();
  const empty: DemandCounts = { demands: 0 };
  if (hint) return { hint, r2: empty, sql: empty, live: false };

  const doc = await readDemandDoc();
  await applyDemandSchema();
  return {
    hint: "",
    r2: demandCountOf(doc),
    sql: { demands: await sqlDemandCount() },
    live: await demandsAreInSql(),
  };
}

export async function copyDemandsToSql(): Promise<DemandCopyReport> {
  const hint = sqlMigrationHint();
  if (hint) throw new Error(hint);

  const report: DemandCopyReport = {
    at: new Date().toISOString(),
    copied: { demands: 0 },
    skipped: { demands: 0 },
    finished: false,
    notes: [],
  };

  await applyDemandSchema();

  const doc = await readDemandDoc();
  const inR2 = demandCountOf(doc);
  const before = await sqlDemandCount();

  const demands = (doc.demands || []) as Demand[];
  const budget = { left: DEMAND_QUERY_BUDGET };
  const result = await copyKind(DEMAND_TABLE, DEMAND_COLUMNS, demands, before, budget, {
    put: (chunk) => insertDemands(chunk.map(flatDemand)),
    chunkBytes: FLAT_CHUNK_BYTES,
  });

  // The running numbers, one per financial year, for the same reason as the
  // sheets above: without them the next demand saved in D1 would start that
  // year's book again at 001.
  await sqlSetDemandCounters(doc.counters || {});

  const after = await sqlDemandCount();
  report.copied = { demands: Math.max(0, after - before) };
  report.skipped = {
    demands: result.skipped + Math.max(0, result.copied - report.copied.demands),
  };

  if (result.remaining > 0) {
    report.notes.push(
      `There are more demands than one run may copy, so ${result.remaining.toLocaleString()} are still to go. Press the button again to carry on. Nothing already copied is copied twice.`
    );
    return report;
  }

  if (after < inR2.demands) {
    report.notes.push(
      "The copy ran, but the database does not hold as many demands as the R2 file does, so the portal is still reading the demands from R2. Press Check to see the two side by side."
    );
    return report;
  }

  await sqlSetDemandFlag(DEMANDS_FILLED);
  report.finished = true;
  report.notes.push(
    `All ${inR2.demands.toLocaleString()} diamond demands are in the database, and the portal is now reading them from it. The receipt chase is unchanged and still kept in its own R2 file. The demand R2 file has not been touched and still holds everything as it was today.`
  );
  return report;
}

// --- The stock book ----------------------------------------------------------
//
// The last of the five, and the one that was over the allowance before it
// moved: 3,429 entries is 2.5 MB, and reading the document, adding one entry
// and writing it back measured 18 milliseconds against the 10 a request gets.
//
// Same rules as the four above: R2 is read and never written, nothing anywhere
// is deleted, an entry already across is left exactly as it is, and the flag
// that makes D1 the live store is set last and only when every entry is there.
//
// Every column of the stock table is a field of the entry, so the entries go in
// whole and the database expands them, as the memo book's and the register's do.
// Nothing is flattened here.

export type StockCounts = { entries: number };

export type StockCheck = {
  hint: string;
  r2: StockCounts;
  sql: StockCounts;
  live: boolean;
};

export type StockCopyReport = {
  at: string;
  copied: StockCounts;
  skipped: StockCounts;
  finished: boolean;
  notes: string[];
};

// The same reckoning as the PD budget above, and the same worst case: asking
// whether the schema is there (1), making it (4), counting before and after
// (2), finding out what is already across (1), the running number (1) and the
// flag at the end (1).
const STOCK_QUERY_BUDGET = MAX_QUERIES_PER_REQUEST - 12;

function stockCountOf(doc: Partial<StockBookDB>): StockCounts {
  return { entries: (doc.entries || []).length };
}

export async function checkStockStores(): Promise<StockCheck> {
  const hint = sqlMigrationHint();
  const empty: StockCounts = { entries: 0 };
  if (hint) return { hint, r2: empty, sql: empty, live: false };

  const doc = await readStockBookDoc();
  // The table has to exist before it can be counted, and making it is safe to
  // repeat.
  await applyStockSchema();
  return {
    hint: "",
    r2: stockCountOf(doc),
    sql: { entries: await sqlStockCount() },
    live: await stockBookIsInSql(),
  };
}

export async function copyStockToSql(): Promise<StockCopyReport> {
  const hint = sqlMigrationHint();
  if (hint) throw new Error(hint);

  const report: StockCopyReport = {
    at: new Date().toISOString(),
    copied: { entries: 0 },
    skipped: { entries: 0 },
    finished: false,
    notes: [],
  };

  await applyStockSchema();

  const doc = await readStockBookDoc();
  const inR2 = stockCountOf(doc);
  const before = await sqlStockCount();

  const entries = (doc.entries || []) as StockEntry[];
  const budget = { left: STOCK_QUERY_BUDGET };
  const result = await copyKind(STOCK_TABLE, STOCK_COLUMNS, entries, before, budget);

  // The book's running number. Without it the next piece taken into stock in D1
  // would start the book again at S0001, writing a second entry under a number
  // that is already on a piece. A number already in D1 that has gone further is
  // left where it is.
  //
  // It goes across on every press, not only the last one, because the number
  // belongs with the entries and a copy that stops half way should not leave
  // the database counting from nowhere.
  await sqlSetStockCounter(doc.seq || 0);

  // What actually went in, counted from the rows that appeared rather than from
  // what the statements were handed: an entry already there is ignored, not
  // written, and saying otherwise would make the second run look like work.
  const after = await sqlStockCount();
  report.copied = { entries: Math.max(0, after - before) };
  report.skipped = {
    entries: result.skipped + Math.max(0, result.copied - report.copied.entries),
  };

  if (result.remaining > 0) {
    report.notes.push(
      `There are more entries than one run may copy, so ${result.remaining.toLocaleString()} are still to go. Press the button again to carry on. Nothing already copied is copied twice.`
    );
    return report;
  }

  // Every entry is across only if the database now holds at least as many as
  // the R2 document does. Anything less and the flag stays off, because the
  // flag is what sends the office to D1.
  if (after < inR2.entries) {
    report.notes.push(
      "The copy ran, but the database does not hold as many entries as the R2 file does, so the portal is still reading the stock book from R2. Press Check to see the two side by side."
    );
    return report;
  }

  await sqlSetStockFlag(STOCK_FILLED);
  report.finished = true;
  report.notes.push(
    `All ${inR2.entries.toLocaleString()} stock entries are in the database, and the portal is now reading the book from it. Taking a piece into stock is one line from here on. The R2 file has not been touched and still holds everything as it was today.`
  );
  return report;
}

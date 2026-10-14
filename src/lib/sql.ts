// The one place that talks to Cloudflare D1.
//
// Why it exists: every module in this portal keeps its records as one whole
// JSON document in R2, read entire and written entire (see db.ts). That was the
// right shape for a filing cabinet of a few hundred kilobytes, and it is the
// wrong shape for a ledger that keeps growing. Saving one memo costs the size
// of the whole memo book: measured at 14 milliseconds of processor time with
// 200 memos and 26 with 400, against a Cloudflare free-plan allowance of 10
// milliseconds per request. There is no waste left to trim. The cost is the
// document itself.
//
// D1 is Cloudflare's own SQL database, free on this plan, and in it a save is
// one row. The time a query takes is time spent waiting on the database, not
// time spent working, and the 10 millisecond allowance only counts working. So
// the same save that costs 26 milliseconds of processor time against R2 costs
// almost none here.
//
// --- The binding -----------------------------------------------------------
//
// D1 does not arrive as a URL and a password the way R2 does. Cloudflare hands
// the database to the Worker as a binding called DB, declared in
// wrangler.jsonc, and the only way to reach it is to ask the running Worker for
// it. Nothing here reads an environment variable.
//
// That binding is absent in three ordinary situations: `next dev` on the office
// PC, `next build` and `opennextjs-cloudflare build`, and a deployed Worker
// whose owner has not created the database yet. None of them is a fault, so
// nothing in this file throws when the binding is missing. hasSql() answers
// false, and every store falls back to the R2 document exactly as before.
//
// --- Fifty queries ---------------------------------------------------------
//
// The free plan allows 50 queries per Worker invocation, which is per request.
// That is the one hard rule to design around, and it is a generous limit for
// anything written as "fetch the rows I need", and no limit at all for anything
// written as "fetch one row per record". So: never a query per record. Either
// batch the statements, or write one statement with an IN list, or hand a whole
// chunk of records to one statement as JSON and let SQLite expand it. A loop
// that issues a query per memo works perfectly on twenty memos in testing and
// fails on the four hundredth in the office.
import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// The free plan's ceiling, per request. Exported so the code that copies
// records across can count its own statements against it rather than guess.
export const MAX_QUERIES_PER_REQUEST = 50;

// --- The shape of D1, as much of it as this portal uses ----------------------
//
// Cloudflare's own D1Database type lives in worker-configuration.d.ts, and that
// file is deliberately kept out of the app's TypeScript config: the Workers
// runtime types redefine enough of fetch and Response to contradict every page
// in this app, which is why the Worker has a tsconfig of its own. So the few
// methods used here are described again, narrowly. Nothing is lost: if these
// ever stopped matching the real binding, every query would fail at once and
// loudly rather than subtly.

export type SqlMeta = { changes?: number; rows_read?: number; rows_written?: number };
export type SqlResult<T> = { results: T[]; meta?: SqlMeta };

type SqlPrepared = {
  bind(...values: unknown[]): SqlPrepared;
  first<T>(): Promise<T | null>;
  run<T>(): Promise<SqlResult<T>>;
  all<T>(): Promise<SqlResult<T>>;
};

export type SqlDatabase = {
  prepare(query: string): SqlPrepared;
  batch<T>(statements: SqlPrepared[]): Promise<SqlResult<T>[]>;
};

// One statement and its values, so a caller can hand several to sqlBatch()
// without touching the binding itself.
export type SqlCall = { query: string; params?: unknown[] };

// --- Reaching the binding ----------------------------------------------------

// Only a binding that was actually found is remembered. A miss is not cached:
// the first call in a given Worker could come from somewhere with no request
// context at all, and caching that "no" would turn one awkward moment into a
// database that stays missing until the next deploy.
let found: SqlDatabase | null = null;

function binding(): SqlDatabase | null {
  if (found) return found;
  try {
    const context = getCloudflareContext() as unknown as
      | { env?: Record<string, unknown> }
      | undefined;
    const candidate = context?.env?.DB as SqlDatabase | undefined;
    // Checked by shape rather than taken on trust, because a half-configured
    // binding, with the name declared and the database not created, is the
    // one case where this would otherwise hand back something unusable.
    if (candidate && typeof candidate.prepare === "function") found = candidate;
  } catch {
    // No request context, no Worker, no binding. All three mean the same thing
    // to everyone upstream: use the R2 document.
    return null;
  }
  return found;
}

// Is the database really there? This is what every store asks before choosing
// which way to read.
export function hasSql(): boolean {
  return !!binding();
}

function db(): SqlDatabase {
  const database = binding();
  if (!database) {
    throw new Error(
      "The D1 database is not attached to this portal, so there is nothing to read. Add the DB binding in wrangler.jsonc and deploy."
    );
  }
  return database;
}

// --- Running statements ------------------------------------------------------

// Every row a query returns.
export async function sqlAll<T>(query: string, params: unknown[] = []): Promise<T[]> {
  const result = await db().prepare(query).bind(...params).all<T>();
  return result.results || [];
}

// The first row, or null. Null means the query matched nothing, which for most
// callers here is an ordinary answer rather than a failure.
export async function sqlFirst<T>(query: string, params: unknown[] = []): Promise<T | null> {
  return db().prepare(query).bind(...params).first<T>();
}

// A statement that changes rows. The number of rows it touched comes back,
// because that is how "was there anything to delete?" is answered without a
// second query asking first.
export async function sqlRun(
  query: string,
  params: unknown[] = []
): Promise<{ changes: number; rows: unknown[] }> {
  const result = await db().prepare(query).bind(...params).run<Record<string, unknown>>();
  return { changes: result.meta?.changes || 0, rows: result.results || [] };
}

// Several statements as one transaction.
//
// This is the only way to make two changes that must both happen or neither:
// D1 runs a batch inside a single transaction, so if the second statement
// fails the first is rolled back. Memo numbering depends on exactly that:
// see takeNextNumber() in memoSql.ts.
//
// Every statement in the batch counts towards the 50 per request.
export async function sqlBatch<T>(calls: SqlCall[]): Promise<SqlResult<T>[]> {
  if (calls.length === 0) return [];
  const database = db();
  const statements = calls.map((call) =>
    database.prepare(call.query).bind(...(call.params || []))
  );
  return database.batch<T>(statements);
}

// --- Tables that are not there yet -------------------------------------------

// "No such table" is an answer; a database that cannot be reached is not.
//
// This distinction is the whole safety of the move, and it is the same one
// db.ts makes about the old Vercel store. Before the tables have been created
// the portal has to read "no memos in D1 yet" and go to R2 for them. But a
// database that is unreachable, or refusing, must never read that way: the next
// save would then go to R2 and the two stores would part company, with the
// office using one and the records piling up in the other.
//
// So only SQLite's own "no such table" is allowed to mean "not set up yet".
// Everything else is thrown, and the screen says so.
export function isMissingTable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /no such table/i.test(message);
}

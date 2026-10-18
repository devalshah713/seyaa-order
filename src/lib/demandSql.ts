// The diamond demands, in SQL.
//
// This is the D1 half of demandStore.ts. The store decides which half to use;
// this file never does. It holds the statements and nothing else.
//
// The smallest of the four modules, and the plainest. A demand is read whole or
// listed, never patched a field at a time, so there is no equivalent here of the
// register's screenful of edits. What it shares with the other three is the
// shape of the move: a save is one row, many records go in as one statement,
// and DD/26-27/004 follows DD/26-27/003 with nothing missing because the number
// is taken by the database inside the transaction that writes the demand.
//
// What did not move: the receipt chase. Saving a demand starts the clock on the
// diamonds it asks for, and that chase is still kept in its own R2 document and
// is reached exactly as before, whichever store the demand itself went to.
import "server-only";
import { sqlAll, sqlFirst, sqlRun } from "./sql";
import {
  DEMAND_COLUMNS,
  DEMAND_COUNTER_TABLE,
  DEMAND_FLAG_TABLE,
  DEMAND_TABLE,
} from "./sqlSchema";
import {
  flattenRow,
  insertFlatRows,
  putRow,
  sqlAllCounters,
  sqlCounterValue,
  sqlSetCounterValues,
  sqlSetFlagValue,
  sqlTableCount,
  sqlTableIds,
  takeNextNumber,
  type FlatRow,
} from "./sqlRecords";
import { joinDemandSearch } from "./demandConfig";
import type { Demand, DemandListRow } from "./demandStore";

function parseDoc(row: { doc: string }): Demand {
  return JSON.parse(row.doc) as Demand;
}

const str = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value);

const numOf = (value: unknown): number => {
  const n = Number(value);
  return isFinite(n) ? n : 0;
};

// --- Reading ------------------------------------------------------------------

// Every demand, whole, newest first. Read by the pages that open a demand and
// by the two readers that walk them all: the design trace, and the seed the
// jangad entry screen builds from a design number.
export async function sqlListDemands(): Promise<Demand[]> {
  const rows = await sqlAll<{ doc: string }>(
    `SELECT doc FROM ${DEMAND_TABLE} ORDER BY created_at DESC`
  );
  return rows.map(parseDoc);
}

export async function sqlGetDemand(id: string): Promise<Demand | null> {
  const row = await sqlFirst<{ doc: string }>(
    `SELECT doc FROM ${DEMAND_TABLE} WHERE id = ?`,
    [id]
  );
  return row ? parseDoc(row) : null;
}

// The list page's own read: six small columns and no `doc`.
//
// Three of those columns hold what the list works out from the demand's rows,
// which is the whole reason they are columns. `rows` is nearly the entire
// demand, so a list that read the rows in order to count the stones and build
// the search text would be reading the demands whole and would be no better
// off than the R2 document was. Here the counting and the joining were done
// when the demand was saved, and the list reads the answers.
export async function sqlDemandRows(): Promise<DemandListRow[]> {
  const rows = await sqlAll<Record<string, unknown>>(
    `SELECT id, demand_no, demand_date, designs, pcs, search
FROM ${DEMAND_TABLE} ORDER BY created_at DESC`
  );
  return rows.map((row) => ({
    id: str(row.id),
    demandNo: str(row.demand_no),
    date: str(row.demand_date),
    designs: parseDesigns(row.designs),
    pcs: numOf(row.pcs),
    // The number goes back on the front of the searchable line here, because
    // the row was written before the database had issued it. The result is the
    // same line the R2 path builds. See demandSearchRest().
    search: joinDemandSearch(str(row.demand_no), str(row.search)),
  }));
}

// A column holding JSON that will not parse was written by something other than
// this portal. Reading it as "no design numbers on the demand" keeps the list
// drawing rather than failing whole.
function parseDesigns(value: unknown): string[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map((d) => str(d)) : [];
  } catch {
    console.error("A demand's design numbers could not be read as JSON.");
    return [];
  }
}

// --- Writing ------------------------------------------------------------------

// The demand written under the next number in its year's book. See
// takeNextNumber() in sqlRecords.ts.
export async function sqlCreateDemand(
  demand: Demand,
  fy: string,
  templates: { id: string; no: string }
): Promise<Demand> {
  return takeNextNumber(
    DEMAND_TABLE,
    DEMAND_COLUMNS,
    demand,
    { table: DEMAND_COUNTER_TABLE, key: fy },
    templates,
    {
      id: { column: "id", path: "$.id" },
      no: { column: "demand_no", path: "$.demandNo" },
      seq: { column: "seq", path: "$.seq" },
    }
  );
}

// An edit: one row replaced by itself with the changes in it. Every column is
// written, the three worked-out ones included, so the list cannot be left
// describing the rows as they were before the edit.
export async function sqlPutDemand(demand: Demand): Promise<void> {
  await putRow(DEMAND_TABLE, DEMAND_COLUMNS, demand);
}

export async function sqlDeleteDemand(id: string): Promise<boolean> {
  const { changes } = await sqlRun(`DELETE FROM ${DEMAND_TABLE} WHERE id = ?`, [id]);
  return changes > 0;
}

// --- The running numbers, the flag, and the copy ------------------------------

export async function sqlDemandCounter(fy: string): Promise<number> {
  return sqlCounterValue(DEMAND_COUNTER_TABLE, fy);
}

export async function sqlDemandCounters(): Promise<Record<string, number>> {
  return sqlAllCounters(DEMAND_COUNTER_TABLE);
}

export async function sqlSetDemandCounters(counters: Record<string, number>): Promise<void> {
  await sqlSetCounterValues(DEMAND_COUNTER_TABLE, counters);
}

export async function sqlSetDemandFlag(flag: string, value = 1): Promise<void> {
  await sqlSetFlagValue(DEMAND_FLAG_TABLE, flag, value);
}

export async function sqlDemandCount(): Promise<number> {
  return sqlTableCount(DEMAND_TABLE);
}

export async function sqlDemandIds(): Promise<Set<string>> {
  return sqlTableIds(DEMAND_TABLE);
}

// A demand reduced to the columns it is stored under, for the copy. Three of
// those columns are worked out from the demand rather than read off it, so the
// copy cannot expand the demands inside the database the way the memo and
// jangad copies do. See insertFlatRows() in sqlRecords.ts.
export function flatDemand(demand: Demand): FlatRow {
  return flattenRow(DEMAND_COLUMNS, demand);
}

export async function insertDemands(flat: FlatRow[]): Promise<void> {
  await insertFlatRows(DEMAND_TABLE, DEMAND_COLUMNS, flat);
}

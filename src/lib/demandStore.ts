// Diamond demand store — same shared-storage pattern as memoStore and
// pdStore, in its own JSON document, and now also in Cloudflare D1.
//
// --- Why there is a second store ------------------------------------------
//
// The same reason as the three modules that moved before it. Every demand sat
// in one JSON document, read whole and written whole, so saving one demand cost
// the size of every demand ever raised. On Cloudflare's free plan a request may
// use ten thousandths of a second of computing time, and a cost that grows with
// the book runs out of it sooner or later whatever is trimmed. In D1 a save is
// one row.
//
// This is the smallest of the four books and was not the one in trouble. It
// moves because it sits beside the PD sheets in the same screens and the same
// trace, and leaving it behind would mean two stores to think about every time
// somebody follows a design from its sheet to its diamonds.
//
// --- Which store is used ---------------------------------------------------
//
// D1, if and only if the database is attached to the Worker AND the demands
// have been copied into it. Otherwise the JSON document in R2, exactly as
// before, every line of which is still here and untouched.
//
// There is no half-way: the copy sets one flag when every demand is across, and
// that flag is the switch. So this can be deployed before the database exists,
// and the database can be filled before or after the deploy, and neither order
// leaves a window where the book reads as empty. That matters: the R2 path
// reads, changes and writes whole, so a book misread as empty would put a blank
// document over the real one on the next save.
//
// Nothing is ever deleted from R2.
//
// --- What did not move ------------------------------------------------------
//
// The receipt chase. Saving a demand starts the clock on the diamonds it asks
// for, and those chases are kept in their own R2 document, read and written
// exactly as before. The hook that starts them is handed the saved demand and
// never touches a store itself, so it works the same whichever store the demand
// went to.
import "server-only";
import { isDbConfigured, readDoc, writeDoc } from "./db";
import { fyFromInput, pad, todayInput } from "./memoFormat";
import { hasSql } from "./sql";
import { demandsAreInSql } from "./sqlSchema";
import { numberTemplate } from "./sqlRecords";
import {
  sqlCreateDemand,
  sqlDeleteDemand,
  sqlDemandCounter,
  sqlDemandCounters,
  sqlDemandRows,
  sqlGetDemand,
  sqlListDemands,
  sqlPutDemand,
} from "./demandSql";
import {
  demandDesigns, demandSearchText, totalPcs, type DemandRow,
} from "./demandConfig";

const DB_PATH = "demand/db.json";

export type Demand = {
  id: string; // e.g. "DD-26-27-001"
  demandNo: string; // e.g. "DD/26-27/001"
  fy: string;
  seq: number;

  date: string; // yyyy-mm-dd
  issuedTo: string; // diamond department / supplier
  notes: string;
  rows: DemandRow[];

  // Which PD sheet this was raised from, so the two can be traced together.
  pdId?: string;
  pdNo?: string;

  createdAt: string;
  updatedAt: string;
};

export type NewDemand = Omit<Demand, "id" | "demandNo" | "fy" | "seq" | "createdAt" | "updatedAt">;
export type DemandDB = { counters: Record<string, number>; demands: Demand[] };

export function isDemandStorageConfigured(): boolean {
  return isDbConfigured();
}

export function normalizeDemandInput(body: Record<string, unknown>): NewDemand {
  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const rawRows = Array.isArray(body.rows) ? body.rows : [];
  const rows: DemandRow[] = rawRows
    .map((raw) => {
      const r = raw as Partial<DemandRow>;
      return {
        designNo: str(r.designNo), shape: str(r.shape), pointers: str(r.pointers),
        pcs: str(r.pcs), comments: str(r.comments), bags: str(r.bags),
        growth: str(r.growth),
      };
    })
    .filter((r) => r.designNo || r.shape || r.pointers || r.pcs || r.bags);

  return {
    date: s("date"),
    issuedTo: s("issuedTo"),
    notes: s("notes"),
    rows,
    pdId: s("pdId") || undefined,
    pdNo: s("pdNo") || undefined,
  };
}

// Is D1 where the demands live?
//
// Both halves have to be true: the database has to be attached, and the demands
// have to be in it. Asked on every call rather than worked out once, because the
// day the copy runs is a day when the answer changes without a deploy.
async function useSql(): Promise<boolean> {
  return hasSql() && (await demandsAreInSql());
}

// How a demand's number is printed, written down here only. The D1 half is
// handed these same two functions to learn the formats from.
export function demandIdFor(fy: string, seq: number): string {
  return `DD-${fy}-${pad(seq)}`;
}

export function demandNoFor(fy: string, seq: number): string {
  return `DD/${fy}/${pad(seq)}`;
}

async function readDB(): Promise<DemandDB> {
  const db = await readDoc<Partial<DemandDB>>(DB_PATH, {});
  return { counters: db.counters || {}, demands: db.demands || [] };
}

// The document as it really is, for the copy into D1. readDB() fills in the
// defaults, which is right everywhere it is used and would quietly invent an
// empty book out of a document that could not be read.
export async function readDemandDoc(): Promise<Partial<DemandDB>> {
  return readDoc<Partial<DemandDB>>(DB_PATH, {});
}

async function writeDB(db: DemandDB): Promise<void> {
  await writeDoc(DB_PATH, db);
}

export async function createDemand(input: NewDemand): Promise<Demand> {
  const date = input.date || todayInput();
  const fy = fyFromInput(date);
  const now = new Date().toISOString();

  // The demand as it will be stored, bar its number: whichever store takes it
  // is the one that decides that, because the number has to be taken and used
  // without anything in between reading it.
  const draft: Demand = {
    ...input,
    date,
    id: "",
    demandNo: "",
    fy,
    seq: 0,
    createdAt: now,
    updatedAt: now,
  };

  // In the database the number is raised and used inside one transaction, so
  // two demands saved in the same moment take 004 and 005 and never both 004.
  // Against the document it still is what it always was: the whole book read
  // in, the counter raised, the whole book written back.
  if (await useSql()) {
    return sqlCreateDemand(draft, fy, {
      id: numberTemplate((seq) => demandIdFor(fy, seq)),
      no: numberTemplate((seq) => demandNoFor(fy, seq)),
    });
  }
  return createInDoc(draft, fy);
}

// The demand into the JSON document, which is what runs until the book has been
// copied across. Unchanged: the book is read, the next number comes off the
// document's own counter, and the book is written back.
async function createInDoc(draft: Demand, fy: string): Promise<Demand> {
  const db = await readDB();
  const seq = (db.counters[fy] || 0) + 1;
  db.counters[fy] = seq;
  const demand: Demand = {
    ...draft,
    id: demandIdFor(fy, seq),
    demandNo: demandNoFor(fy, seq),
    seq,
  };
  db.demands.push(demand);
  await writeDB(db);
  return demand;
}

export async function listDemands(): Promise<Demand[]> {
  // The database sorts it, by the same key and to the same order.
  if (await useSql()) return sqlListDemands();

  const db = await readDB();
  return db.demands.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// --- The list screen's own shape ---------------------------------------------

// One row of the demand list, and nothing else.
//
// The list used to be handed whole demands. That is expensive because of
// `rows`: a demand carries one row per diamond size, each with its comments and
// bag count, and the table is a client component, so React wrote every field of
// every row into the page the server sent. All the table does with them is list
// the distinct design numbers and add up the pieces, and all the search does is
// look for text in three of their seven fields. Measured on a few hundred
// demands that is tens of milliseconds and most of a megabyte, and a request on
// the free Worker plan is allowed ten.
//
// So the designs and the piece total are worked out here, and the searchable
// text is prepared here as one string, which is both smaller than the rows and
// exactly what the search was building in the browser on every keystroke. The
// notes, the financial year, the sequence, the PD link, the timestamps and each
// row's comments and bags never reach the browser at all.
export type DemandListRow = {
  id: string;
  demandNo: string;
  date: string;
  // The distinct design numbers, in the order they appear on the demand.
  designs: string[];
  // Stones to count out, not stones per piece. See totalPcs.
  pcs: number;
  // Everything the search can match on, joined exactly as the browser used to
  // join it and lower-cased once instead of once per keystroke.
  search: string;
};

// The three worked-out fields come off demandConfig, which is also where the
// database's own three columns come from, so the figure in the Pcs column and
// the text the search matches are worked out in exactly one place however the
// demand was read.
function toRow(d: Demand): DemandListRow {
  return {
    id: d.id,
    demandNo: d.demandNo,
    date: d.date,
    designs: demandDesigns(d),
    pcs: totalPcs(d.rows),
    search: demandSearchText(d),
  };
}

export async function listDemandRows(): Promise<DemandListRow[]> {
  // From the database this is six small columns and no demand read whole: the
  // designs, the piece total and the search text were worked out when the
  // demand was saved. See sqlDemandRows().
  if (await useSql()) return sqlDemandRows();

  const db = await readDB();
  return db.demands
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(toRow);
}

export async function getDemand(id: string): Promise<Demand | null> {
  if (await useSql()) return sqlGetDemand(id);

  const db = await readDB();
  return db.demands.find((d) => d.id === id) || null;
}

export async function updateDemand(id: string, patch: NewDemand): Promise<Demand | null> {
  // One demand read and one demand written, rather than the book twice. The
  // read is needed and cannot be done in the database: an edit keeps the
  // identity fields and the date when the patch leaves it blank, so the demand
  // as it stands has to be in hand to merge onto.
  if (await useSql()) {
    const current = await sqlGetDemand(id);
    if (!current) return null;
    const updated = merged(current, patch);
    await sqlPutDemand(updated);
    return updated;
  }

  const db = await readDB();
  const idx = db.demands.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  const updated = merged(db.demands[idx], patch);
  db.demands[idx] = updated;
  await writeDB(db);
  return updated;
}

// An edit onto the demand as it stands. Identity fields (id, demandNo, fy, seq,
// createdAt) are preserved because the patch does not carry them.
function merged(current: Demand, patch: NewDemand): Demand {
  return {
    ...current,
    ...patch,
    date: patch.date || current.date,
    updatedAt: new Date().toISOString(),
  };
}

export async function deleteDemand(id: string): Promise<boolean> {
  if (await useSql()) return sqlDeleteDemand(id);

  const db = await readDB();
  const before = db.demands.length;
  db.demands = db.demands.filter((d) => d.id !== id);
  if (db.demands.length === before) return false;
  await writeDB(db);
  return true;
}

export async function nextDemandNo(dateInput: string): Promise<string> {
  const fy = fyFromInput(dateInput || todayInput());
  // A preview, not a number taken. If somebody else saves first this was a
  // guess, and the number on the saved demand is the right one.
  if (await useSql()) return demandNoFor(fy, (await sqlDemandCounter(fy)) + 1);

  const db = await readDB();
  return demandNoFor(fy, (db.counters[fy] || 0) + 1);
}

// For the nightly backup.
//
// The running numbers go with the demands, as they always have: a restore that
// brought the demands back without them would start the book again at 001 and
// write second demands under numbers that are already on the books.
export async function exportDemandDb(): Promise<DemandDB> {
  if (await useSql()) {
    const [demands, counters] = await Promise.all([sqlListDemands(), sqlDemandCounters()]);
    return { counters, demands };
  }
  return readDB();
}

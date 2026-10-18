// The PD sheets, in SQL.
//
// This is the D1 half of pdStore.ts. The store decides which half to use; this
// file never does. It holds the statements and nothing else.
//
// The same three rules as the memo book and the jangad register.
//
// One: a save is one row. Marking a piece as being made, or pointing a photo
// somewhere else, writes that sheet's row and reads nothing.
//
// Two: fifty queries per request, and never a query per sheet. The one read
// here that could have been a query per sheet is the design lookup, and it is
// two queries however many sheets the book holds. See sqlPdSheetsByIds().
//
// Three: PD/26-27/012 follows PD/26-27/011 with nothing missing, and two people
// saving at the same moment never both get 012. The number is taken by the
// database inside the transaction that writes the sheet, which is
// takeNextNumber() in sqlRecords.ts.
import "server-only";
import { sqlAll, sqlFirst, sqlRun } from "./sql";
import {
  PD_COLUMNS,
  PD_COUNTER_TABLE,
  PD_FLAG_TABLE,
  PD_TABLE,
} from "./sqlSchema";
import {
  insertFlatRows,
  flattenRow,
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
import type { PdPiece } from "./designNo";
import type { PdSheet } from "./pdStore";

function parseDoc(row: { doc: string }): PdSheet {
  return JSON.parse(row.doc) as PdSheet;
}

// --- Reading ------------------------------------------------------------------

// Every sheet as it is stored, newest first. Used where a reader wants whole
// sheets: the design register, the sheet backup, the design trace.
export async function sqlListPdSheets(): Promise<PdSheet[]> {
  const rows = await sqlAll<{ doc: string }>(
    `SELECT doc FROM ${PD_TABLE} ORDER BY created_at DESC`
  );
  return rows.map(parseDoc);
}

export async function sqlGetPdSheet(id: string): Promise<PdSheet | null> {
  const row = await sqlFirst<{ doc: string }>(
    `SELECT doc FROM ${PD_TABLE} WHERE id = ?`,
    [id]
  );
  return row ? parseDoc(row) : null;
}

// --- The list page ------------------------------------------------------------

// The list's own columns, and no `doc`.
//
// This is the read the list page lives on, and the reason the columns exist. A
// sheet carries a photo path, a page of fields, the structured diamond sizes
// behind its printed line and a run of up to four hundred pieces; the table
// shows a dozen fields, a piece count and the pieces that reached the stock
// book. Reading `doc` here would bring all of it back to throw nearly all of it
// away.
export type PdColumnRow = {
  id: string;
  pdNo: string;
  sku: string;
  product: string;
  assignedTo: string;
  deliveryDate: string;
  quantity: string;
  createdBy: string;
  updatedBy: string;
  category: string;
  subCategory: string;
  pdMerchandiser: string;
  zone: string;
  orderType: string;
  diaQuality: string;
  inStock: number;
  stocked: { no: string; stockNo: string }[];
};

const str = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value);

const numOf = (value: unknown): number => {
  const n = Number(value);
  return isFinite(n) ? n : 0;
};

// A column holding JSON that will not parse is a column written by something
// other than this portal. Reading it as "nothing recorded" keeps the list
// drawing rather than failing whole, which is the reading the stores have
// always given a record with no pieces on it.
function parseList<T>(value: unknown, what: string): T[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    console.error(`A PD sheet's ${what} could not be read as JSON.`);
    return [];
  }
}

export async function sqlPdRows(): Promise<PdColumnRow[]> {
  const rows = await sqlAll<Record<string, unknown>>(
    `SELECT id, pd_no, sku, product, assigned_to, delivery_date, quantity,
  created_by, updated_by, category, sub_category, pd_merchandiser, zone,
  order_type, dia_quality, in_stock, stocked
FROM ${PD_TABLE} ORDER BY created_at DESC`
  );
  return rows.map((row) => ({
    id: str(row.id),
    pdNo: str(row.pd_no),
    sku: str(row.sku),
    product: str(row.product),
    assignedTo: str(row.assigned_to),
    deliveryDate: str(row.delivery_date),
    quantity: str(row.quantity),
    createdBy: str(row.created_by),
    updatedBy: str(row.updated_by),
    category: str(row.category),
    subCategory: str(row.sub_category),
    pdMerchandiser: str(row.pd_merchandiser),
    zone: str(row.zone),
    orderType: str(row.order_type),
    diaQuality: str(row.dia_quality),
    inStock: numOf(row.in_stock),
    stocked: parseList<{ no: string; stockNo: string }>(row.stocked, "stocked pieces"),
  }));
}

// --- The design lookup --------------------------------------------------------
//
// Finding the sheets a typed design number names cannot be done in SQL, and
// that is not a shortcut not taken. matchDesign() in designNo.ts answers two
// questions at once: does the typed text appear in the design number, and does
// the typed text name one piece of the run this design was made in. The second
// one is the whole reason the function exists. "SN-BR-AMF-10CT-46" has to reach
// the sheet written "SN-BR-AMF-10CT-45-49", because piece 46 has no record of
// its own until it reaches the stock book; answering that means reading the
// design number as segments, finding the run inside it wherever it sits,
// comparing the codes either side and then testing whether 46 falls between 45
// and 49. There is no LIKE that does any of that.
//
// So it is two queries. The first asks for the design numbers and nothing else,
// and the portal runs the real match over them. The second asks for the sheets
// that matched.
//
// Why that is safe: matchDesign reads exactly one field of a sheet, `sku`, and
// sku is a real column. So the candidates this fetches are every sheet in the
// book, not a narrowed guess, and the answer cannot differ by one sheet from
// what the same code gives when it is handed whole sheets. Nothing is filtered
// before the matching, so nothing can be filtered out wrongly.
//
// What it costs: two small columns per sheet on the first query, which on a
// book of a few hundred sheets is a few tens of kilobytes rather than the
// megabytes the whole book is, and then whole sheets for the handful that
// matched. The ordering is the list's own, newest first, so the hits come back
// in the order the R2 path produced them before they are sorted by kind.
export async function sqlPdDesigns(): Promise<{ id: string; sku: string }[]> {
  const rows = await sqlAll<{ id: string; sku: string }>(
    `SELECT id, sku FROM ${PD_TABLE} ORDER BY created_at DESC`
  );
  return rows.map((row) => ({ id: str(row.id), sku: str(row.sku) }));
}

// How many ids one IN list carries. D1 allows a hundred bound values in a
// statement, so fifty leaves room and is more than any real design search
// matches: someone holding a packet types the design on it. A search short
// enough to match hundreds of sheets costs one statement per fifty of them,
// which stays well inside the fifty a request is allowed.
const IDS_PER_QUERY = 50;

export async function sqlPdSheetsByIds(ids: string[]): Promise<PdSheet[]> {
  if (ids.length === 0) return [];
  const found = new Map<string, PdSheet>();
  for (let i = 0; i < ids.length; i += IDS_PER_QUERY) {
    const chunk = ids.slice(i, i + IDS_PER_QUERY);
    const marks = chunk.map(() => "?").join(", ");
    const rows = await sqlAll<{ doc: string }>(
      `SELECT doc FROM ${PD_TABLE} WHERE id IN (${marks})`,
      chunk
    );
    for (const row of rows) {
      const sheet = parseDoc(row);
      found.set(sheet.id, sheet);
    }
  }
  // Back in the order they were asked for, which is the order the lookup found
  // them in. A database is under no obligation to return rows in the order of
  // an IN list, and the caller sorts exact piece hits to the front of this.
  return ids.map((id) => found.get(id)).filter((s): s is PdSheet => !!s);
}

// --- Writing ------------------------------------------------------------------

// The sheet written under the next number in its year's book. See
// takeNextNumber() in sqlRecords.ts.
export async function sqlCreatePdSheet(
  sheet: PdSheet,
  fy: string,
  templates: { id: string; no: string }
): Promise<PdSheet> {
  return takeNextNumber(
    PD_TABLE,
    PD_COLUMNS,
    sheet,
    { table: PD_COUNTER_TABLE, key: fy },
    templates,
    {
      id: { column: "id", path: "$.id" },
      no: { column: "pd_no", path: "$.pdNo" },
      seq: { column: "seq", path: "$.seq" },
    }
  );
}

// An edit: one row replaced by itself with the changes in it. Every column is
// written, so there is nothing to merge.
export async function sqlPutPdSheet(sheet: PdSheet): Promise<void> {
  await putRow(PD_TABLE, PD_COLUMNS, sheet);
}

// The design number of one sheet, which is all that reconciling its pieces
// needs. One row, one column: the piece list is rebuilt from the design number
// and whatever was sent in, so the stored pieces are not wanted.
export async function sqlPdSku(id: string): Promise<string | null> {
  const row = await sqlFirst<{ sku: string }>(
    `SELECT sku FROM ${PD_TABLE} WHERE id = ?`,
    [id]
  );
  return row ? str(row.sku) : null;
}

// Progress on the pieces, as one row written.
//
// The piece list is set inside the stored sheet with json_set rather than the
// sheet being read out, changed and put back, and the two columns the list
// reads are written beside it so they cannot fall behind what they describe.
// Nothing comes back when there is no such sheet, which is how "not found"
// reaches the screen as a 404 rather than as a save that silently did nothing.
export async function sqlSetPdPieces(
  id: string,
  pieces: PdPiece[],
  inStock: number,
  stocked: { no: string; stockNo: string }[],
  at: string
): Promise<PdSheet | null> {
  const { rows } = await sqlRun(
    `UPDATE ${PD_TABLE} SET in_stock = ?, stocked = ?,
  doc = json_set(json_set(doc, '$.pieces', json(?)), '$.updatedAt', ?)
WHERE id = ? RETURNING doc`,
    [inStock, JSON.stringify(stocked), JSON.stringify(pieces), at, id]
  );
  const written = rows as { doc: string }[];
  return written.length ? parseDoc(written[0]) : null;
}

// Where the photo is, and nothing else. No column holds the photo, so this is
// one row written and nothing read first.
export async function sqlSetPdPhoto(
  id: string,
  photoPath: string,
  photoPublicId: string,
  at: string
): Promise<PdSheet | null> {
  const { rows } = await sqlRun(
    `UPDATE ${PD_TABLE} SET
  doc = json_set(json_set(json_set(doc, '$.photoPath', ?), '$.photoPublicId', ?), '$.updatedAt', ?)
WHERE id = ? RETURNING doc`,
    [photoPath, photoPublicId, at, id]
  );
  const written = rows as { doc: string }[];
  return written.length ? parseDoc(written[0]) : null;
}

export async function sqlDeletePdSheet(id: string): Promise<boolean> {
  const { changes } = await sqlRun(`DELETE FROM ${PD_TABLE} WHERE id = ?`, [id]);
  return changes > 0;
}

// --- The running numbers, the flag, and the copy ------------------------------

// What a year's book stands at, for the next-number preview on the form.
// Nothing is taken: the next save takes its own, inside its own transaction.
export async function sqlPdCounter(fy: string): Promise<number> {
  return sqlCounterValue(PD_COUNTER_TABLE, fy);
}

// Every year's running number, for the backup's own copy of the document.
export async function sqlPdCounters(): Promise<Record<string, number>> {
  return sqlAllCounters(PD_COUNTER_TABLE);
}

// The numbers set outright, which only the copy may do. A number already in D1
// that has gone further belongs to sheets written here since.
export async function sqlSetPdCounters(counters: Record<string, number>): Promise<void> {
  await sqlSetCounterValues(PD_COUNTER_TABLE, counters);
}

export async function sqlSetPdFlag(flag: string, value = 1): Promise<void> {
  await sqlSetFlagValue(PD_FLAG_TABLE, flag, value);
}

export async function sqlPdCount(): Promise<number> {
  return sqlTableCount(PD_TABLE);
}

// The ids the book already holds, so a copy that has to be run more than once
// can leave out what is already across instead of offering it again.
export async function sqlPdIds(): Promise<Set<string>> {
  return sqlTableIds(PD_TABLE);
}

// A sheet reduced to the columns it is stored under, for the copy. Two of those
// columns are worked out from the sheet rather than read off it, so the copy
// cannot expand the sheets inside the database the way the memo and jangad
// copies do. See insertFlatRows() in sqlRecords.ts.
export function flatPdSheet(sheet: PdSheet): FlatRow {
  return flattenRow(PD_COLUMNS, sheet);
}

export async function insertPdSheets(flat: FlatRow[]): Promise<void> {
  await insertFlatRows(PD_TABLE, PD_COLUMNS, flat);
}

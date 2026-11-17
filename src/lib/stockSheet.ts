// Live stock position, read straight from the Google stock sheets.
//
// Only two columns matter: "Sr. No." (our stock number) and "LOCATION". The
// sheets are read by header name, not column position — LOCATION sits in a
// different column in each file, and the new book renamed most of the others.
//
// A piece may only go out on a memo if it is in INDIA. Everything else is
// refused, with a reason the person filling the memo can act on.
import "server-only";
import { stockKey } from "./memoFormat";

// Each sheet carries its own tab id, and that is the point of this shape.
//
// The first two share one only because the second was copied from the first,
// and for a long time the id was written down once for both. The book opened
// for 26-27 was built fresh, so its stock tab has an id of its own. Renaming a
// tab does not change it: Google fixes it when the tab is made.
//
// Getting one wrong does not go quiet. fetchSheet reads the tab, finds no
// "Sr. No." or "LOCATION" column, and says so by name.
const SHEETS = [
  { name: "Stock Sheet New For India", id: "1hXt65tYxq39Mh-LVHkKIc89FRWTAq5xG5fDIT8J7KzU", gid: "92413194" },
  { name: "Stock Sheet of Seyaa Factory for India", id: "1sWcfksBvp42a91q4LIkbx6qYZpi3AHv4DESshysvM-Y", gid: "92413194" },
  // The new year's book. The old two stay because the stock in them is still
  // real stock: a piece made in March does not stop existing in April.
  { name: "Stock Sheet India New FY 26-27", id: "19ah737er6WlDzyv_YFXvdOGksh0ZpfjFIZQBN4H9L3E", gid: "537349134" },
];

// The tab must be fetched through the /export endpoint, NOT /gviz/tq. gviz
// infers a type per column from the first rows it sees: column A opens with
// ~2,500 plain numbers, so it typed the column numeric and returned *empty*
// for every alphanumeric code below — silently hiding 2,464 pieces, including
// everything from A1000 onwards. /export returns the displayed text and does
// no such inference.

// The sheets are a couple of megabytes together, so re-fetching on every
// keystroke would be unusable. A short window keeps it effectively live while
// staying responsive.
const CACHE_MS = 60_000;

export type StockState = "available" | "reserved" | "unusable" | "foreign" | "unknown";

export type StockRow = { stockNo: string; location: string; state: StockState; reason: string };

// Locations that put a piece outside the country. Matched on the first word so
// "HK SELL" and "DXB SELL" are caught without listing every combination.
const FOREIGN = new Set(["USA", "US", "HK", "DXB", "UAE", "DUBAI"]);

export function classify(rawLocation: string): { state: StockState; reason: string } {
  const loc = (rawLocation || "").trim().toUpperCase();

  if (loc === "INDIA") return { state: "available", reason: "" };

  const head = loc.split(/\s+/)[0];
  if (FOREIGN.has(head)) {
    return { state: "foreign", reason: `Currently in ${loc}` };
  }

  if (loc.startsWith("INDIA")) {
    // e.g. "INDIA SELL" — in the country, but spoken for.
    return { state: "reserved", reason: `Marked ${loc}` };
  }
  if (loc === "" || loc === "0") {
    return { state: "unusable", reason: "No location recorded in the stock sheet" };
  }
  if (loc.startsWith("MELT")) return { state: "unusable", reason: "Melted" };
  if (loc.startsWith("REPAIR")) return { state: "unusable", reason: "In repair" };

  // Anything new and unrecognised is shown but refused, rather than quietly
  // treated as available.
  return { state: "unusable", reason: `Location is "${loc}"` };
}

// Minimal RFC-4180 reader — Google's CSV export quotes any field containing a
// comma, and doubles quotes inside them.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    if (c === "\r") continue;
    field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function columnIndex(header: string[], wanted: string[]): number {
  const norm = header.map((h) => h.replace(/[^a-z0-9]/gi, "").toLowerCase());
  for (const w of wanted) {
    const i = norm.indexOf(w.replace(/[^a-z0-9]/gi, "").toLowerCase());
    if (i !== -1) return i;
  }
  return -1;
}

async function fetchSheet(sheet: { name: string; id: string; gid: string }): Promise<StockRow[]> {
  const { id, gid } = sheet;
  const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
  const res = await fetch(url, { cache: "no-store" });
  // Named as well as numbered, because a person reading this message has to
  // know which of three sheets to go and look at.
  if (!res.ok) throw new Error(`${sheet.name} (${id}) returned ${res.status}`);

  const rows = parseCsv(await res.text());
  if (!rows.length) return [];

  const header = rows[0];
  const srCol = columnIndex(header, ["Sr. No.", "SrNo", "Sr No"]);
  const locCol = columnIndex(header, ["LOCATION", "Location"]);
  // If the tab id ever changes this reads some other tab, so fail loudly
  // rather than quietly returning nothing and blocking every memo.
  if (srCol === -1 || locCol === -1) {
    throw new Error(
      `${sheet.name}: the stock tab (gid ${gid}) has no "Sr. No." or "LOCATION" column, so this is not the tab it should be.`
    );
  }

  const out: StockRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const stockNo = (rows[i][srCol] || "").trim().toUpperCase();
    if (!stockNo) continue;
    const location = (rows[i][locCol] || "").trim();
    const { state, reason } = classify(location);
    out.push({ stockNo, location, state, reason });
  }
  return out;
}

let cache: { at: number; map: Map<string, StockRow> } | null = null;

export async function loadStock(force = false): Promise<Map<string, StockRow>> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.map;

  const results = await Promise.all(SHEETS.map((s) => fetchSheet(s)));
  const map = new Map<string, StockRow>();
  for (const rows of results) {
    // Later sheets win on a duplicate Sr. No.; in practice the two do not overlap.
    for (const r of rows) map.set(r.stockNo, r);
  }
  cache = { at: Date.now(), map };
  return map;
}

export type StockCheck = StockRow & { found: boolean; canMemo: boolean };

export function checkOne(map: Map<string, StockRow>, stockNo: string): StockCheck {
  const key = stockNo.trim().toUpperCase();
  const row = map.get(key);
  if (!row) {
    return {
      stockNo: key,
      location: "",
      state: "unknown",
      reason: "Not found in either stock sheet",
      found: false,
      canMemo: false,
    };
  }
  return { ...row, found: true, canMemo: row.state === "available" };
}

export async function checkMany(stockNos: string[]): Promise<StockCheck[]> {
  const map = await loadStock();
  return stockNos.map((s) => checkOne(map, s));
}

// Gate for saving a memo. The form warns as you type, but this is what
// actually decides — a request can always be made without the form.
//
// If the sheets cannot be read the memo is refused rather than waved through:
// the whole point is that nothing leaves the country's stock unverified. The
// message says so, so staff know it is a connection problem and not their input.
export async function assertMemoable(
  stockNos: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!stockNos.length) return { ok: true };

  let checks: StockCheck[];
  try {
    checks = await checkMany(stockNos);
  } catch (err) {
    return {
      ok: false,
      error: `Could not read the stock sheets to verify these pieces, so the memo was not saved. ${
        err instanceof Error ? err.message : ""
      }`.trim(),
    };
  }

  const blocked = checks.filter((c) => !c.canMemo);
  if (!blocked.length) return { ok: true };

  const detail = blocked
    .slice(0, 8)
    .map((b) => `${b.stockNo} — ${b.reason}`)
    .join("; ");
  const more = blocked.length > 8 ? ` (and ${blocked.length - 8} more)` : "";
  return {
    ok: false,
    error: `Only stock in INDIA can go out on a memo. ${detail}${more}`,
  };
}

// --- Several stock numbers at once, for the audit ------------------------------

// What the master sheet says about each of these numbers, or why it could not
// be asked.
//
// "Not in the sheet" and "the sheet could not be read" are kept apart on
// purpose, and it is the most important thing in this function. A number
// missing from that sheet is exactly what stops a memo being written, so a
// report that read a connection failure as "absent" would send somebody looking
// for a piece that is sitting there. checkOne() cannot answer this: it is given
// a map, so by the time it runs the question has already been answered.
export type SheetLookup =
  | { reached: true; rows: Map<string, StockRow> }
  | { reached: false; error: string };

export async function sheetRowsForNos(keys: string[]): Promise<SheetLookup> {
  if (keys.length === 0) return { reached: true, rows: new Map() };
  try {
    const map = await loadStock();
    // Keyed by the audit's own rule rather than by the sheet's own spelling,
    // because this is a sheet people type into: the same piece is written
    // "A0232" in one row and "a 0232" in another.
    const rows = new Map<string, StockRow>();
    for (const row of map.values()) {
      const key = stockKey(row.stockNo);
      // The first spelling wins, which is what loadStock() does with a
      // duplicate Sr. No. between the two sheets.
      if (key && !rows.has(key)) rows.set(key, row);
    }
    return { reached: true, rows };
  } catch (err) {
    return {
      reached: false,
      error: err instanceof Error ? err.message : "The stock sheets could not be read.",
    };
  }
}

// Everything staff are allowed to see when browsing: in India, or in India but
// spoken for, or here with no usable location. Foreign stock is left out.
export async function visibleStock(): Promise<StockRow[]> {
  const map = await loadStock();
  return [...map.values()]
    .filter((r) => r.state !== "foreign")
    .sort((a, b) => a.stockNo.localeCompare(b.stockNo, undefined, { numeric: true }));
}

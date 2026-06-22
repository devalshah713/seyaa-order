// Read/write layer for the "Stock In from Manufacturer" tracker. Talks to the
// same Google Apps Script Web App, against a dedicated "Stock Entry" tab. One
// stock piece is keyed by its Stock No.; each diamond breakup line is one row.
// Item-level fields (date, weights, prices, totals) sit on the piece's first
// row only — matching the merged look of the owner's sample — while the keys
// (Stock No., Design Number) repeat on every row so grouping/lookups work.
import { sheetCall } from "./sheetStore";
import {
  STOCK_TAB,
  STOCK_HEADERS,
  parseNum,
  round2,
  pointerFor,
} from "./stockConfig";

// One diamond breakup line of a stock piece.
export type StockStone = {
  weightBreakup: string; // carats for this line
  pcs: string;
  pointers: string; // usually auto = (carats/pcs)*100
  shape: string;
  sieveSize: string;
  diamondPriceUsd: string;
  diamondPriceInr: string;
};

// A stock piece as entered.
export type NewStockEntry = {
  stockNo?: string; // blank = auto-numbered
  date: string; // dd/mm/yyyy (blank = today)
  designName: string;
  designNumber: string;
  location: string;
  goldDetails: string;
  inchSize: string;
  grossWeight: string;
  netWeight: string;
  manufacturerName: string;
  productCode: string;
  goldPriceUsd: string;
  laborUsd: string;
  goldPriceInr: string;
  laborInr: string;
  comments: string;
  stones: StockStone[];
};

// Reconstructed stock piece for display.
export type StockEntry = NewStockEntry & {
  stockNo: string;
  totalDiamondWeight: string;
  totalDiaPcs: string;
  totalUsd: string;
  totalInr: string;
};

const KEY_HEADER = "Stock No.";

// Sheets treats a leading = + - @ as a formula; force plain text.
function escapeCell(v: string): string {
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}
// Purely-numeric identifiers (Design Number "001", Product Code, Stock No.) get
// coerced to numbers by Sheets, dropping leading zeros. Keep them text.
function escapeIdCell(v: string): string {
  return /^\d+$/.test(v) ? "'" + v : escapeCell(v);
}
const TEXT_ID_HEADERS = new Set<string>(["Design Number", "Product Code"]);

function today(): string {
  return new Date().toLocaleDateString("en-GB"); // dd/mm/yyyy
}

// Build the sheet rows for one stock piece (one row per breakup line).
function buildRows(entry: StockEntry): string[][] {
  const totalDiaWt = round2(entry.stones.reduce((s, st) => s + parseNum(st.weightBreakup), 0));
  const totalDiaPcs = entry.stones.reduce((s, st) => s + parseNum(st.pcs), 0);
  const diaUsd = round2(entry.stones.reduce((s, st) => s + parseNum(st.diamondPriceUsd), 0));
  const diaInr = round2(entry.stones.reduce((s, st) => s + parseNum(st.diamondPriceInr), 0));
  const totalUsd = round2(diaUsd + parseNum(entry.goldPriceUsd) + parseNum(entry.laborUsd));
  const totalInr = round2(diaInr + parseNum(entry.goldPriceInr) + parseNum(entry.laborInr));

  const lines = entry.stones.length ? entry.stones : [emptyStone()];

  return lines.map((st, i) => {
    const first = i === 0;
    const ptr = st.pointers && st.pointers.trim() !== ""
      ? st.pointers
      : (() => { const p = pointerFor(st.weightBreakup, st.pcs); return p ? String(p) : ""; })();

    const get = (header: string): string => {
      switch (header) {
        // keys — every row
        case "Stock No.": return entry.stockNo;
        case "Design Number": return entry.designNumber;
        // item-level — first row only
        case "DATE": return first ? (entry.date || today()) : "";
        case "DESIGN NAME": return first ? entry.designName : "";
        case "LOCATION": return first ? entry.location : "";
        case "Gold Details": return first ? entry.goldDetails : "";
        case "INCH SIZE": return first ? entry.inchSize : "";
        case "GROSS WEIGHT": return first ? entry.grossWeight : "";
        case "NET WEIGHT": return first ? entry.netWeight : "";
        case "TOTAL DIAMOND WEIGHT": return first ? (totalDiaWt ? String(totalDiaWt) : "") : "";
        case "TOTAL DIA PCS.": return first ? (totalDiaPcs ? String(totalDiaPcs) : "") : "";
        case "Manufacturer Name": return first ? entry.manufacturerName : "";
        case "Product Code": return first ? entry.productCode : "";
        case "Gold Price ($)": return first ? entry.goldPriceUsd : "";
        case "Labor ($)": return first ? entry.laborUsd : "";
        case "Total ($)": return first ? (totalUsd ? String(totalUsd) : "") : "";
        case "Gold Price (₹)": return first ? entry.goldPriceInr : "";
        case "Labor (₹)": return first ? entry.laborInr : "";
        case "Total (₹)": return first ? (totalInr ? String(totalInr) : "") : "";
        case "COMMENTS/REMARKS": return first ? entry.comments : "";
        // stone-level — every row
        case "DIAMOND WEIGHT BREAKUP": return st.weightBreakup;
        case "DIA PCS.": return st.pcs;
        case "POINTERS": return ptr;
        case "SHAPE": return st.shape;
        case "Sieve / Size": return st.sieveSize;
        case "Diamond Price ($)": return st.diamondPriceUsd;
        case "Diamond Price (₹)": return st.diamondPriceInr;
      }
      return "";
    };

    return STOCK_HEADERS.map((h) =>
      TEXT_ID_HEADERS.has(h) ? escapeIdCell(get(h)) : escapeCell(get(h))
    );
  });
}

function emptyStone(): StockStone {
  return { weightBreakup: "", pcs: "", pointers: "", shape: "", sieveSize: "", diamondPriceUsd: "", diamondPriceInr: "" };
}

function toObjects(headers: string[], rows: string[][]): Record<string, string>[] {
  return rows.map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => { o[h] = r[i] == null ? "" : String(r[i]); });
    return o;
  });
}

function groupStock(objs: Record<string, string>[]): StockEntry[] {
  const byStock = new Map<string, StockEntry>();
  for (const r of objs) {
    const no = r["Stock No."];
    if (!no) continue;
    if (!byStock.has(no)) {
      byStock.set(no, {
        stockNo: no,
        date: "",
        designName: "",
        designNumber: "",
        location: "",
        goldDetails: "",
        inchSize: "",
        grossWeight: "",
        netWeight: "",
        manufacturerName: "",
        productCode: "",
        goldPriceUsd: "",
        laborUsd: "",
        goldPriceInr: "",
        laborInr: "",
        comments: "",
        totalDiamondWeight: "",
        totalDiaPcs: "",
        totalUsd: "",
        totalInr: "",
        stones: [],
      });
    }
    const e = byStock.get(no)!;
    // Item-level fields live on the first row; pick them up whenever present.
    const set = (k: keyof StockEntry, v: string) => {
      if (v && !e[k]) (e[k] as string) = v;
    };
    set("date", r["DATE"]);
    set("designName", r["DESIGN NAME"]);
    set("designNumber", r["Design Number"]);
    set("location", r["LOCATION"]);
    set("goldDetails", r["Gold Details"]);
    set("inchSize", r["INCH SIZE"]);
    set("grossWeight", r["GROSS WEIGHT"]);
    set("netWeight", r["NET WEIGHT"]);
    set("manufacturerName", r["Manufacturer Name"]);
    set("productCode", r["Product Code"]);
    set("goldPriceUsd", r["Gold Price ($)"]);
    set("laborUsd", r["Labor ($)"]);
    set("goldPriceInr", r["Gold Price (₹)"]);
    set("laborInr", r["Labor (₹)"]);
    set("comments", r["COMMENTS/REMARKS"]);
    set("totalDiamondWeight", r["TOTAL DIAMOND WEIGHT"]);
    set("totalDiaPcs", r["TOTAL DIA PCS."]);
    set("totalUsd", r["Total ($)"]);
    set("totalInr", r["Total (₹)"]);
    // A breakup line exists if the row carries any stone field.
    if (r["SHAPE"] || r["Sieve / Size"] || r["DIAMOND WEIGHT BREAKUP"] || r["DIA PCS."]) {
      e.stones.push({
        weightBreakup: r["DIAMOND WEIGHT BREAKUP"] || "",
        pcs: r["DIA PCS."] || "",
        pointers: r["POINTERS"] || "",
        shape: r["SHAPE"] || "",
        sieveSize: r["Sieve / Size"] || "",
        diamondPriceUsd: r["Diamond Price ($)"] || "",
        diamondPriceInr: r["Diamond Price (₹)"] || "",
      });
    }
  }
  return Array.from(byStock.values());
}

export async function listStockEntries(): Promise<StockEntry[]> {
  try {
    const data = await sheetCall<{ ok: true; headers: string[]; rows: string[][] }>({
      action: "listTab",
      tab: STOCK_TAB,
    });
    const objs = toObjects(
      data.headers || (STOCK_HEADERS as readonly string[]).slice(),
      data.rows || []
    );
    const entries = groupStock(objs);
    entries.sort((a, b) => b.stockNo.localeCompare(a.stockNo, undefined, { numeric: true }));
    return entries;
  } catch (e) {
    console.error("[stock] failed to list:", e instanceof Error ? e.message : e);
    return [];
  }
}

export async function getStockEntry(stockNo: string): Promise<StockEntry | null> {
  const all = await listStockEntries();
  return all.find((e) => e.stockNo === stockNo) || null;
}

// Next Stock No. = (highest existing numeric Stock No.) + 1.
async function nextStockNo(): Promise<number> {
  const all = await listStockEntries();
  let max = 0;
  for (const e of all) {
    const n = parseInt(String(e.stockNo).replace(/[^\d]/g, ""), 10);
    if (!isNaN(n)) max = Math.max(max, n);
  }
  return max + 1;
}

// Create a stock piece (auto-numbering Stock No.), or replace an existing one
// when a Stock No. is supplied (edit). Writes all of the piece's rows atomically
// via the tab-aware "replaceByKey" action (auto-creates the tab on first write).
export async function createStockEntry(entry: NewStockEntry): Promise<string> {
  const stockNo = entry.stockNo && entry.stockNo.trim() ? entry.stockNo.trim() : String(await nextStockNo());
  const full: StockEntry = {
    ...entry,
    stockNo,
    totalDiamondWeight: "",
    totalDiaPcs: "",
    totalUsd: "",
    totalInr: "",
  };
  const rows = buildRows(full);
  await sheetCall({
    action: "replaceByKey",
    tab: STOCK_TAB,
    keyHeader: KEY_HEADER,
    keyValue: stockNo,
    headers: STOCK_HEADERS,
    rows,
  });
  return stockNo;
}

// Delete a stock piece's rows (used if an order is deleted, or manual cleanup).
export async function deleteStockByDesign(designNumber: string): Promise<void> {
  try {
    await sheetCall({
      action: "replaceByKey",
      tab: STOCK_TAB,
      keyHeader: "Design Number",
      keyValue: designNumber,
      headers: STOCK_HEADERS,
      rows: [],
    });
  } catch (e) {
    console.error("[stock] delete by design failed:", e instanceof Error ? e.message : e);
  }
}

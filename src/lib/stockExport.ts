// Server-only: produce the Stock Entry export as a freshly-built .xlsx that
// reproduces the owner's "SINGLE STOCK ENTRY" sample (the 27 columns, header
// styling and column widths). One row per diamond breakup line; item-level
// values sit on each piece's first row only, exactly like the sample.
import ExcelJS from "exceljs";
import { STOCK_HEADERS, STOCK_WIDTHS, STOCK_NUMERIC } from "./stockConfig";
import { listStockEntries, StockEntry } from "./stockStore";

const SHEET_NAME = "Stock Entry";

function num(v: string): string | number | null {
  if (v == null || v === "") return null;
  return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
}

// Build the cell value for (entry, stone line index, header).
function cellFor(e: StockEntry, st: StockEntry["stones"][number], first: boolean, header: string): string {
  switch (header) {
    case "Stock No.": return e.stockNo;
    case "Design Number": return e.designNumber;
    case "DATE": return first ? e.date : "";
    case "DESIGN NAME": return first ? e.designName : "";
    case "LOCATION": return first ? e.location : "";
    case "Gold Details": return first ? e.goldDetails : "";
    case "INCH SIZE": return first ? e.inchSize : "";
    case "GROSS WEIGHT": return first ? e.grossWeight : "";
    case "NET WEIGHT": return first ? e.netWeight : "";
    case "TOTAL DIAMOND WEIGHT": return first ? e.totalDiamondWeight : "";
    case "TOTAL DIA PCS.": return first ? e.totalDiaPcs : "";
    case "Manufacturer Name": return first ? e.manufacturerName : "";
    case "Product Code": return first ? e.productCode : "";
    case "Gold Price ($)": return first ? e.goldPriceUsd : "";
    case "Labor ($)": return first ? e.laborUsd : "";
    case "Total ($)": return first ? e.totalUsd : "";
    case "Gold Price (₹)": return first ? e.goldPriceInr : "";
    case "Labor (₹)": return first ? e.laborInr : "";
    case "Total (₹)": return first ? e.totalInr : "";
    case "COMMENTS/REMARKS": return first ? e.comments : "";
    case "DIAMOND WEIGHT BREAKUP": return st.weightBreakup;
    case "DIA PCS.": return st.pcs;
    case "POINTERS": return st.pointers;
    case "SHAPE": return st.shape;
    case "Sieve / Size": return st.sieveSize;
    case "Diamond Price ($)": return st.diamondPriceUsd;
    case "Diamond Price (₹)": return st.diamondPriceInr;
  }
  return "";
}

export async function buildStockWorkbook(designNumbers?: string[]): Promise<ArrayBuffer> {
  let entries = await listStockEntries();
  // Oldest-first by Stock No. for a tidy ledger.
  entries = [...entries].sort((a, b) => a.stockNo.localeCompare(b.stockNo, undefined, { numeric: true }));
  if (designNumbers && designNumbers.length) {
    const want = new Set(designNumbers);
    entries = entries.filter((e) => want.has(e.designNumber));
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(SHEET_NAME, { views: [{ state: "frozen", ySplit: 1 }] });

  ws.columns = STOCK_HEADERS.map((_, i) => ({
    width: STOCK_WIDTHS[i] || 15,
    style: { font: { name: "Arial", size: 10 } },
  }));

  const header = ws.getRow(1);
  STOCK_HEADERS.forEach((title, i) => {
    const cell = header.getCell(i + 1);
    cell.value = title;
    cell.font = { name: "Arial", size: 10, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });

  let r = 2;
  for (const e of entries) {
    const stones = e.stones.length ? e.stones : [{
      weightBreakup: "", pcs: "", pointers: "", shape: "", sieveSize: "", diamondPriceUsd: "", diamondPriceInr: "",
    }];
    stones.forEach((st, i) => {
      const row = ws.getRow(r++);
      STOCK_HEADERS.forEach((h, c) => {
        const raw = cellFor(e, st, i === 0, h);
        row.getCell(c + 1).value = STOCK_NUMERIC.has(h) ? num(raw) : (raw || null);
      });
    });
  }

  const out = await wb.xlsx.writeBuffer();
  const u8 = out instanceof Uint8Array ? out : new Uint8Array(out as ArrayBuffer);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

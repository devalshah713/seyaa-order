// Server-only: build the "Sell of Diamonds" sheet for a set of stock pieces.
// When finished pieces are taken into stock, the diamonds used in them are
// treated as SOLD and the rest as returned. This sheet is handed to the diamond
// team to reconcile what they issued vs what was used (sold) vs returned.
//
// It is built from the Diamond Issue records of the selected stocks' designs,
// in the owner's "sell sheet" column layout, as a freshly-authored .xlsx.
import ExcelJS from "exceljs";
import { listIssues } from "./diamondIssueStore";
import { ISSUE_STATUS_LABELS, parseNum, round2 } from "./diamondIssueConfig";
import { listStockEntries } from "./stockStore";

const SHEET_NAME = "sell sheet";

// Exact column order of the owner-supplied sell sheet sample (A..X = 24 cols).
const HEADERS = [
  "Sr. No.",
  "Sell Date",
  "MFG Issue Date",
  "Design Number",
  "Sub Design No",
  "Product",
  "Diamond Shape",
  "Setting",
  "Certi No.",
  "Diamond Size",
  "Diamond Pcs",
  "Diamond Carats",
  "Cvd/Hpht",
  "Price",
  "Memo No.",
  "Dia Cts Used",
  "Dia Pcs Used",
  "Return",
  "Total Price",
  "Status",
  "TOTAL CTS WT",
  "TOTAL VAL",
  "AVERAGE PRICE",
  "Comments",
] as const;

// Column widths (from the sample where given, sensible defaults elsewhere).
const WIDTHS: Record<string, number> = {
  "Sr. No.": 8,
  "Sell Date": 13,
  "MFG Issue Date": 13,
  "Design Number": 14,
  "Sub Design No": 11.140625,
  "Product": 11,
  "Diamond Shape": 13,
};
const DEFAULT_WIDTH = 14.5703125;

const NUMERIC = new Set<string>([
  "Sr. No.",
  "Diamond Pcs",
  "Diamond Carats",
  "Price",
  "Dia Cts Used",
  "Dia Pcs Used",
  "Return",
  "Total Price",
  "TOTAL CTS WT",
  "TOTAL VAL",
  "AVERAGE PRICE",
]);
// Identifier columns kept as text (preserve leading zeros).
const TEXT_ID = new Set<string>(["Design Number", "Sub Design No", "Certi No.", "Memo No."]);

function num(v: string): string | number | null {
  if (v == null || v === "") return null;
  return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
}

function today(): string {
  return new Date().toLocaleDateString("en-GB"); // dd/mm/yyyy
}

// Build the sell sheet for the given stock numbers. Returns the .xlsx buffer.
export async function buildSellSheet(stockNos: string[]): Promise<ArrayBuffer> {
  const stocks = await listStockEntries();
  const wanted = new Set(stockNos.map((s) => s.trim()));
  const selected = stocks.filter((s) => wanted.has(s.stockNo));

  // Distinct design -> the stock's date (used as the Sell Date for that design).
  const designDate = new Map<string, string>();
  for (const s of selected) {
    const d = s.designNumber || "";
    if (d && !designDate.has(d)) designDate.set(d, s.date || today());
  }

  const issues = await listIssues();

  type Cell = Record<string, string>;
  const out: (string | number | null)[][] = [];
  let sr = 1;

  // Group output by design, then by memo (each memo's lines together).
  for (const [design, sellDate] of designDate) {
    const memos = issues
      .filter((i) => (i.designNumber || "") === design)
      .sort((a, b) => a.memoNo.localeCompare(b.memoNo, undefined, { numeric: true }));

    for (const issue of memos) {
      const totalCts = round2(issue.lines.reduce((s, ln) => s + parseNum(ln.values["Diamond Carats"]), 0));
      issue.lines.forEach((ln, i) => {
        const first = i === 0;
        const carats = parseNum(ln.values["Diamond Carats"]);
        const ctsUsed = ln.diaCtsUsed;
        const ret = ln.differenceDiaUsed && ln.differenceDiaUsed !== ""
          ? ln.differenceDiaUsed
          : (String(ctsUsed).trim() !== "" ? String(round2(carats - parseNum(ctsUsed))) : "");
        const cell: Cell = {
          "Sr. No.": String(sr++),
          "Sell Date": sellDate,
          "MFG Issue Date": issue.date,
          "Design Number": issue.designNumber,
          "Sub Design No": issue.subDesignNo,
          "Product": ln.values["Product"] || "",
          "Diamond Shape": ln.values["Diamond Shape"] || "",
          "Setting": ln.values["SETTING"] || "",
          "Certi No.": ln.values["Certi No."] || "",
          "Diamond Size": ln.values["Diamond Size"] || "",
          "Diamond Pcs": ln.values["Diamond Pcs"] || "",
          "Diamond Carats": ln.values["Diamond Carats"] || "",
          "Cvd/Hpht": ln.values["Cvd/Hpht"] || "",
          "Price": ln.values["Price"] || "",
          "Memo No.": issue.memoNo,
          "Dia Cts Used": ln.diaCtsUsed || "",
          "Dia Pcs Used": ln.diaPcsUsed || "",
          "Return": ret,
          "Total Price": ln.totalPrice || "",
          "Status": ISSUE_STATUS_LABELS[issue.status] || issue.status,
          "TOTAL CTS WT": first ? (totalCts ? String(totalCts) : "") : "",
          "TOTAL VAL": first ? issue.additionOfTotalPrice : "",
          "AVERAGE PRICE": first ? issue.averagePrice : "",
          "Comments": first ? issue.comments : "",
        };
        out.push(HEADERS.map((h) => (NUMERIC.has(h) ? num(cell[h]) : (cell[h] || null))));
      });
    }
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(SHEET_NAME, { views: [{ state: "frozen", ySplit: 1 }] });

  ws.columns = HEADERS.map((h) => ({
    width: WIDTHS[h] || DEFAULT_WIDTH,
    style: { font: { name: "Arial", size: 10 } },
  }));

  const header = ws.getRow(1);
  HEADERS.forEach((title, i) => {
    const cell = header.getCell(i + 1);
    cell.value = title;
    cell.font = { name: "Arial", size: 10, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });

  out.forEach((row, r) => {
    const excelRow = ws.getRow(2 + r);
    row.forEach((value, c) => {
      const header = HEADERS[c];
      // Force identifier columns to text so leading zeros survive.
      if (TEXT_ID.has(header) && value != null && value !== "") {
        excelRow.getCell(c + 1).value = String(value);
        excelRow.getCell(c + 1).numFmt = "@";
      } else {
        excelRow.getCell(c + 1).value = value;
      }
    });
  });

  const buf = await wb.xlsx.writeBuffer();
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf as ArrayBuffer);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

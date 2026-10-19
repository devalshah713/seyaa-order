import "server-only";
import ExcelJS from "exceljs";
import {
  AUDIT_SHEET_HEADERS,
  AUDIT_SHEET_WIDTHS,
  auditSheetRows,
  type StockAuditReport,
} from "./stockAuditFormat";

// The audit as a file he can sort and filter.
//
// Two sheets. "Findings" is one row per stock number per finding, which is the
// shape that lets him sort by number, filter to one module, or sort by date and
// read a piece's life in order — a block per number reads well on paper and
// cannot be sorted. "Summary" is one row per number carrying the short answer,
// for the glance down the list.
//
// Dates go out as dates and the few real figures as numbers, so the file totals
// and sorts without anyone cleaning it first — the same as the four exports
// already in the portal. Everything else is text on purpose: a stock number
// like 746 must stay the text it was asked for, or Excel reads it as a quantity
// and drops any leading nought.

const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" }, left: { style: "thin" },
  bottom: { style: "thin" }, right: { style: "thin" },
};

function header(ws: ExcelJS.Worksheet, titles: string[], widths: number[]) {
  ws.columns = titles.map((_, i) => ({
    width: widths[i] || 16,
    style: { font: { name: "Arial", size: 10 } },
  }));
  const row = ws.getRow(1);
  titles.forEach((title, i) => {
    const cell = row.getCell(i + 1);
    cell.value = title;
    cell.font = { name: "Arial", size: 10, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = THIN;
  });
  row.height = 28;
}

const dateCell = (cell: ExcelJS.Cell, raw: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw || "");
  if (m) {
    cell.value = new Date(+m[1], +m[2] - 1, +m[3]);
    cell.numFmt = "dd/mm/yyyy";
  } else if (raw) cell.value = raw;
};

const SUMMARY_HEADERS = [
  "Stock No. asked for", "In the stock book", "Memos", "Jangad entries",
  "QC checks", "PD sheets", "In the Google sheet", "The short answer",
];
const SUMMARY_WIDTHS = [18, 16, 8, 14, 10, 10, 20, 90];

export async function buildStockAuditWorkbook(
  report: StockAuditReport
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();

  // --- Sheet 1: the short answer per number ---------------------------------
  const sum = wb.addWorksheet("Summary", { views: [{ state: "frozen", ySplit: 1 }] });
  header(sum, SUMMARY_HEADERS, SUMMARY_WIDTHS);

  let s = 2;
  for (const b of report.blocks) {
    const row = sum.getRow(s++);
    // A module that could not be read says so rather than reading as nought,
    // which would be indistinguishable from "nothing under this number".
    const count = (read: boolean, n: number) => (read ? n : "not read");
    const values: (string | number)[] = [
      b.asked,
      b.searched.book ? (b.book ? "Yes" : "No") : "not read",
      count(b.searched.memos, b.memos.length),
      count(b.searched.jangad, b.jangad.length),
      count(b.searched.qc, b.qc.length),
      count(b.searched.pd, b.pd.length),
      b.searched.sheet ? (b.sheet ? b.sheet.location || "yes, no location" : "No") : "not read",
      b.headline.join(" "),
    ];
    values.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.border = THIN;
      cell.value = v;
      if (i === 7) cell.alignment = { wrapText: true, vertical: "top" };
    });
  }

  // --- Sheet 2: one row per finding -----------------------------------------
  const ws = wb.addWorksheet("Findings", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 1 }],
  });
  header(ws, AUDIT_SHEET_HEADERS, AUDIT_SHEET_WIDTHS);

  let r = 2;
  for (const f of auditSheetRows(report)) {
    const row = ws.getRow(r++);
    const put = (col: number, v: string) => {
      const cell = row.getCell(col);
      cell.border = THIN;
      if (v) cell.value = v;
    };
    put(1, f.asked);
    put(2, f.storedNo);
    put(3, f.module);
    put(4, f.reference);
    row.getCell(5).border = THIN;
    dateCell(row.getCell(5), f.date);
    put(6, f.what);
    put(7, f.party);
    put(8, f.weight);
    put(9, f.pieces);
    put(10, f.status);
    put(11, f.detail);
  }

  const out = await wb.xlsx.writeBuffer();
  const u8 = out instanceof Uint8Array ? out : new Uint8Array(out as ArrayBuffer);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

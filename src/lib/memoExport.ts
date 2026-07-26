import "server-only";
import ExcelJS from "exceljs";
import type { Memo } from "./memoStore";
import { formatDate } from "./memoFormat";

// Human-readable Excel export of all memos. Two sheets:
//  - "Memos": one row per memo (summary).
//  - "Items": one row per stock number (so a stock number is findable with Ctrl-F).
// Follows the app's existing exceljs export pattern (frozen bold header, then
// writeBuffer() normalized to a clean ArrayBuffer slice).

const MEMO_HEADERS = [
  "Memo No", "Date", "Purpose", "To", "Through", "Mobile",
  "Total Pcs", "Stock Numbers", "Comment", "Created At",
];
const MEMO_WIDTHS = [16, 14, 12, 26, 22, 16, 10, 46, 30, 22];

const ITEM_HEADERS = ["Memo No", "Date", "Type", "Stock No"];
const ITEM_WIDTHS = [16, 14, 16, 14];

function styleHeader(ws: ExcelJS.Worksheet, titles: string[], widths: number[]) {
  ws.columns = titles.map((_, i) => ({
    width: widths[i] || 15,
    style: { font: { name: "Arial", size: 10 } },
  }));
  const header = ws.getRow(1);
  titles.forEach((title, i) => {
    const cell = header.getCell(i + 1);
    cell.value = title;
    cell.font = { name: "Arial", size: 10, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
}

export async function buildMemoWorkbook(memos: Memo[]): Promise<ArrayBuffer> {
  // Oldest-first for a tidy ledger.
  const rows = [...memos].sort((a, b) =>
    a.memoNo.localeCompare(b.memoNo, undefined, { numeric: true })
  );

  const wb = new ExcelJS.Workbook();

  const summary = wb.addWorksheet("Memos", { views: [{ state: "frozen", ySplit: 1 }] });
  styleHeader(summary, MEMO_HEADERS, MEMO_WIDTHS);
  let r = 2;
  for (const m of rows) {
    const stockNos = m.items.flatMap((it) => it.stockNos);
    summary.getRow(r++).values = [
      m.memoNo,
      formatDate(m.date),
      m.purpose,
      m.to,
      m.through,
      m.mobile,
      m.totalPcs,
      stockNos.join(", "),
      m.comment,
      m.createdAt,
    ];
  }

  const items = wb.addWorksheet("Items", { views: [{ state: "frozen", ySplit: 1 }] });
  styleHeader(items, ITEM_HEADERS, ITEM_WIDTHS);
  let ir = 2;
  for (const m of rows) {
    for (const it of m.items) {
      for (const stockNo of it.stockNos) {
        items.getRow(ir++).values = [m.memoNo, formatDate(m.date), it.type, stockNo];
      }
    }
  }

  const out = await wb.xlsx.writeBuffer();
  const u8 = out instanceof Uint8Array ? out : new Uint8Array(out as ArrayBuffer);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

import "server-only";
import ExcelJS from "exceljs";
import type { Memo } from "./memoStore";
import { eventDate, formatDate, linesFor, outcomeLabel, type StockEvent } from "./memoFormat";

// Human-readable Excel export of all memos. Three sheets:
//  - "Memos": one row per memo, jewellery and gold together (summary).
//  - "Items": one row per stock number (so a stock number is findable with Ctrl-F).
//  - "Gold":  one row per gold line, for weight totals and factory reconciliation.
// Follows the app's existing exceljs export pattern (frozen bold header, then
// writeBuffer() normalized to a clean ArrayBuffer slice).

const MEMO_HEADERS = [
  "Memo No", "Kind", "Date", "Purpose", "To / Factory", "Through", "Mobile",
  "Total Pcs", "Gross Wt (g)", "Fine Wt (g)", "Against", "Stock Numbers",
  "Comment", "Created At",
];
const MEMO_WIDTHS = [16, 11, 14, 20, 26, 22, 16, 10, 13, 13, 16, 46, 30, 22];

const ITEM_HEADERS = ["Memo No", "Date", "Type", "Stock No", "Status", "Movement Date", "By", "Replaced By", "Note"];
const ITEM_WIDTHS = [16, 14, 16, 14, 14, 15, 14, 14, 30];

const TRAIL_HEADERS = ["Movement Date", "Recorded At", "By", "Memo No", "Stock No", "Outcome", "Replaced By", "Note"];
const TRAIL_WIDTHS = [15, 22, 16, 16, 14, 14, 14, 34];

const GOLD_HEADERS = [
  "Memo No", "Date", "Purpose", "Factory", "Description",
  "Touch", "Gross Wt (g)", "Fine Wt (g)", "Against",
];
const GOLD_WIDTHS = [16, 14, 20, 26, 28, 10, 13, 13, 16];

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

export async function buildMemoWorkbook(
  memos: Memo[],
  events: StockEvent[] = []
): Promise<ArrayBuffer> {
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
    const isGold = m.kind === "gold";
    summary.getRow(r++).values = [
      m.memoNo,
      isGold ? "Gold" : "Jewellery",
      formatDate(m.date),
      m.purpose,
      m.to,
      m.through,
      m.mobile,
      isGold ? "" : m.totalPcs,
      isGold ? m.totalGrossWt : "",
      isGold ? m.totalFineWt : "",
      m.againstMemoNo || "",
      stockNos.join(", "),
      m.comment,
      m.createdAt,
    ];
  }

  const items = wb.addWorksheet("Items", { views: [{ state: "frozen", ySplit: 1 }] });
  styleHeader(items, ITEM_HEADERS, ITEM_WIDTHS);
  let ir = 2;
  for (const m of rows) {
    for (const line of linesFor(m.id, m.items, events)) {
      const e = line.event;
      items.getRow(ir++).values = [
        m.memoNo,
        formatDate(m.date),
        line.type,
        line.stockNo,
        outcomeLabel(line.outcome),
        e ? eventDate(e) : "",
        e?.by || "",
        e?.replacedBy || "",
        e?.note || "",
      ];
    }
  }

  const gold = wb.addWorksheet("Gold", { views: [{ state: "frozen", ySplit: 1 }] });
  styleHeader(gold, GOLD_HEADERS, GOLD_WIDTHS);
  let gr = 2;
  for (const m of rows) {
    for (const g of m.goldItems || []) {
      gold.getRow(gr++).values = [
        m.memoNo,
        formatDate(m.date),
        m.purpose,
        m.to,
        g.description,
        g.touch,
        g.grossWt,
        g.fineWt,
        m.againstMemoNo || "",
      ];
    }
  }

  // Every movement ever recorded, oldest first — the audit trail itself, so a
  // backup taken today can answer "who marked this returned, and when".
  const trail = wb.addWorksheet("Audit Trail", { views: [{ state: "frozen", ySplit: 1 }] });
  styleHeader(trail, TRAIL_HEADERS, TRAIL_WIDTHS);
  let tr = 2;
  for (const e of [...events].sort((a, b) => (a.at < b.at ? -1 : 1))) {
    trail.getRow(tr++).values = [
      eventDate(e),
      e.at,
      e.by,
      e.memoNo,
      e.stockNo,
      outcomeLabel(e.outcome),
      e.replacedBy || "",
      e.note || "",
    ];
  }

  const out = await wb.xlsx.writeBuffer();
  const u8 = out instanceof Uint8Array ? out : new Uint8Array(out as ArrayBuffer);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

import "server-only";
import ExcelJS from "exceljs";
import {
  EXPORT_COLUMNS, isMergedColumn, mergeSpans, num, type JangadRow,
} from "./jangadConfig";

// The register is ruled like the paper it replaces.
const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" }, left: { style: "thin" },
  bottom: { style: "thin" }, right: { style: "thin" },
};

// The register as the accounts team's own workbook: the same 25 columns, in the
// same order, spelled the same way, so a row exported here pastes straight into
// the existing file. Columns added since sit after those 25 rather than
// shifting one out from under data already in the sheet.
//
// Values are written typed rather than as text — weights and prices go out as
// numbers and dates as dates, so the sheet totals and sorts without anyone
// having to clean it first.
export async function buildJangadWorkbook(rows: JangadRow[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Diamond Jangad", { views: [{ state: "frozen", ySplit: 1 }] });

  ws.columns = EXPORT_COLUMNS.map((c) => ({
    width: c.width,
    style: { font: { name: "Arial", size: 10 } },
  }));

  const header = ws.getRow(1);
  EXPORT_COLUMNS.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: "Arial", size: 10, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = THIN;
  });

  // Oldest first, so the register reads as a ledger.
  const ordered = [...rows].sort((a, b) =>
    a.createdAt === b.createdAt
      ? a.id.localeCompare(b.id, undefined, { numeric: true })
      : a.createdAt < b.createdAt ? -1 : 1
  );

  const FIRST_ROW = 2;
  let r = FIRST_ROW;
  for (const row of ordered) {
    const line = ws.getRow(r++);
    EXPORT_COLUMNS.forEach((c, i) => {
      const raw = row[c.key] || "";
      const cell = line.getCell(i + 1);
      cell.border = THIN;
      cell.alignment = { vertical: "middle" };
      if (!raw) return;
      if (c.kind === "number") {
        const n = num(raw);
        // Anything that is not really a number is kept as typed rather than
        // dropped — the sheet should show what the accountant wrote.
        cell.value = n === null ? raw : n;
      } else if (c.kind === "date") {
        // yyyy-mm-dd from a date input; parsed as a plain local date so it does
        // not shift a day in a different timezone.
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
        if (m) {
          cell.value = new Date(+m[1], +m[2] - 1, +m[3]);
          cell.numFmt = "dd-mmm-yyyy";
        } else cell.value = raw;
      } else {
        cell.value = raw;
      }
    });
  }

  // The design is written once and ruled down its rows, as in the workbook this
  // replaces: the date, the design number, the product, the memo and the
  // manufacturer belong to the issue, and the piece number to the piece — not
  // to each stone size under them.
  const spans = mergeSpans(ordered);
  EXPORT_COLUMNS.forEach((c, i) => {
    if (!isMergedColumn(c.key)) return;
    const col = i + 1;
    for (const [start, span] of spans.get(c.key) || []) {
      if (span < 2) continue;
      const top = FIRST_ROW + start;
      ws.mergeCells(top, col, top + span - 1, col);
      ws.getCell(top, col).alignment = { vertical: "middle", wrapText: true };
    }
  });

  const out = await wb.xlsx.writeBuffer();
  const u8 = out instanceof Uint8Array ? out : new Uint8Array(out as ArrayBuffer);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

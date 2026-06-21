// Server-only: produce the Diamond Issue export as a clean, freshly-built
// .xlsx that reproduces the owner's template format (sheet name, the 21
// columns, header styling, column widths and a frozen header row).
//
// We deliberately build a NEW workbook rather than loading and re-saving the
// owner's original file: that original was created in Google Sheets, and
// loading + re-saving a foreign workbook with exceljs makes Excel show a
// "we found a problem with some content" repair prompt. A freshly authored
// workbook is canonical and opens cleanly.
import ExcelJS from "exceljs";
import { buildExportRows } from "./diamondIssueStore";

const SHEET_NAME = "Seyaa Solitaire";

// [header, column width] in the exact order of the template (A..U). Widths are
// taken from the owner's file so the columns look identical.
const COLUMNS: [string, number][] = [
  ["Date", 5],
  ["Design Number", 14.5546875],
  ["Sub Design No", 14.109375],
  ["Product", 8],
  ["Diamond Shape", 14.77734375],
  ["SETTING", 8.88671875],
  ["Certi No.", 8.77734375],
  ["Diamond Size", 12.88671875],
  ["Diamond Pcs", 12.44140625],
  ["Diamond Carats", 15.109375],
  ["Cvd/Hpht", 9.21875],
  ["Price", 5.44140625],
  ["Memo No.", 9.6640625],
  ["Dia Cts Used", 12.33203125],
  ["Dia Pcs Used", 12.5546875],
  ["Difference Dia Used", 18.33203125],
  ["Total Price", 10.33203125],
  ["Addition of Total Price", 20.5546875],
  ["Average Price", 13.21875],
  ["Status", 6.6640625],
  ["Received date", 13.33203125],
];

export async function buildDiamondIssueWorkbook(
  designNumbers: string[]
): Promise<ArrayBuffer> {
  const rows = await buildExportRows(designNumbers);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(SHEET_NAME, {
    views: [{ state: "frozen", ySplit: 1 }], // freeze the header row
  });

  // Apply width + a default Arial 10 font to every column's cells.
  ws.columns = COLUMNS.map(([, width]) => ({
    width,
    style: { font: { name: "Arial", size: 10 } },
  }));

  // Header row: Arial 10 bold, centered — matching the template.
  const header = ws.getRow(1);
  header.height = 16.5;
  COLUMNS.forEach(([title], i) => {
    const cell = header.getCell(i + 1);
    cell.value = title;
    cell.font = { name: "Arial", size: 10, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  // Data rows from row 2 down.
  rows.forEach((row, r) => {
    const excelRow = ws.getRow(2 + r);
    row.forEach((value, c) => {
      excelRow.getCell(c + 1).value = value;
    });
  });

  const out = await wb.xlsx.writeBuffer();
  const u8 = out instanceof Uint8Array ? out : new Uint8Array(out as ArrayBuffer);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

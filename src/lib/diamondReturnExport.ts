// Server-only: produce the Diamond Return Log export as a clean, freshly-built
// .xlsx that reproduces the owner's "DIAMOND RETURN FOR PARTY" template exactly
// (sheet name, the 10 columns, header styling and column widths).
//
// As with the Diamond Issue export, we build a NEW workbook rather than loading
// and re-saving the owner's original Google-Sheets file (re-saving a foreign
// workbook with exceljs makes Excel show a "we found a problem" repair prompt).
import ExcelJS from "exceljs";
import { DIAMOND_RETURN_HEADERS } from "./diamondReturnConfig";
import type { ReturnRow } from "./diamondReturnStore";

// Sheet name matches the owner's file exactly — including the trailing space.
const SHEET_NAME = "diamond return for party ";

// Columns in the template's exact order (A..J), all width 15 as in the original.
const COLUMNS: [string, number][] = (DIAMOND_RETURN_HEADERS as readonly string[]).map(
  (h) => [h, 15] as [string, number]
);

// Values that are clean numbers are written as numbers so the sheet stays usable
// for sums — except DESIGN NO, which must stay text to preserve leading zeros.
const NUMERIC_HEADERS = new Set<string>(["Sr NO", "Carat Weight", "No of pcs"]);

function cellValue(header: string, raw: string): string | number {
  if (raw == null || raw === "") return "";
  if (NUMERIC_HEADERS.has(header) && /^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

export async function buildDiamondReturnWorkbook(returns: ReturnRow[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(SHEET_NAME);

  // Width + a default Arial 10 font on every column's cells.
  ws.columns = COLUMNS.map(([, width]) => ({
    width,
    style: { font: { name: "Arial", size: 10 } },
  }));

  // Header row: Arial 10 bold, centered, wrapped — matching the template.
  const header = ws.getRow(1);
  COLUMNS.forEach(([title], i) => {
    const cell = header.getCell(i + 1);
    cell.value = title;
    cell.font = { name: "Arial", size: 10, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });

  // Each return maps to one row, in DIAMOND_RETURN_HEADERS order.
  const valueFor = (r: ReturnRow, header: string): string => {
    switch (header) {
      case "Sr NO": return r.srNo;
      case "Date": return r.date;
      case "Description": return r.description;
      case "Diamond Shape": return r.shape;
      case "Diamond Size": return r.size;
      case "Carat Weight": return r.caratWeight;
      case "No of pcs": return r.pcs;
      case "Comments": return r.comments;
      case "DESIGN NO": return r.designNo;
      case "REMARK": return r.remark;
    }
    return "";
  };

  returns.forEach((r, idx) => {
    const excelRow = ws.getRow(2 + idx);
    COLUMNS.forEach(([title], c) => {
      excelRow.getCell(c + 1).value = cellValue(title, valueFor(r, title));
    });
  });

  const out = await wb.xlsx.writeBuffer();
  const u8 = out instanceof Uint8Array ? out : new Uint8Array(out as ArrayBuffer);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

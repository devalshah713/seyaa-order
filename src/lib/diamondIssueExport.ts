// Server-only: turn export rows into an .xlsx that is byte-faithful to the
// owner-supplied template. We load the embedded template (so headers, fonts,
// column widths and freeze panes are exactly as provided) and only write the
// data rows from row 2 down — nothing else about the workbook is touched.
import ExcelJS from "exceljs";
import { DIAMOND_ISSUE_TEMPLATE_B64 } from "./diamondIssueTemplate";
import { buildExportRows } from "./diamondIssueStore";

const HEADER_ROWS = 1; // the template's header occupies row 1

export async function buildDiamondIssueWorkbook(
  designNumbers: string[]
): Promise<ArrayBuffer> {
  const rows = await buildExportRows(designNumbers);

  const wb = new ExcelJS.Workbook();
  // @types/node's generic Buffer<ArrayBuffer> clashes with exceljs's bundled
  // Buffer type, so cast to exactly the parameter type load() expects.
  const template = Buffer.from(DIAMOND_ISSUE_TEMPLATE_B64, "base64");
  await wb.xlsx.load(template as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const ws = wb.worksheets[0];

  rows.forEach((row, r) => {
    const excelRow = ws.getRow(HEADER_ROWS + 1 + r);
    row.forEach((value, c) => {
      excelRow.getCell(c + 1).value = value;
    });
  });

  const out = await wb.xlsx.writeBuffer();
  // Normalize to a standalone ArrayBuffer (Node Buffers share a pool, so slice
  // to exactly this workbook's bytes) — NextResponse accepts an ArrayBuffer.
  const u8 = out instanceof Uint8Array ? out : new Uint8Array(out as ArrayBuffer);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

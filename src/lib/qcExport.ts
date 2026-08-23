import "server-only";
import ExcelJS from "exceljs";
import { qcHeaders, qcResult, qcRow, type QcRecord } from "./qcConfig";

// The QC register in the layout the office's own sheet uses: the piece, who
// checked it and when, every check with its remark side by side, then the
// verdict.
//
// One table has to hold every category's checks, so the columns are the union
// of them all. A check a category does not use is simply blank on its rows —
// which is also how it reads on the sheet this replaces.

const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" }, left: { style: "thin" },
  bottom: { style: "thin" }, right: { style: "thin" },
};

export async function buildQcWorkbook(
  records: QcRecord[],
  checks: string[]
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("QC", { views: [{ state: "frozen", xSplit: 2, ySplit: 1 }] });

  const headers = qcHeaders(checks);
  ws.columns = headers.map((h) => ({
    width: h.length > 30 ? 30 : Math.max(11, Math.min(h.length + 3, 26)),
    style: { font: { name: "Arial", size: 10 } },
  }));

  const head = ws.getRow(1);
  headers.forEach((h, i) => {
    const cell = head.getCell(i + 1);
    cell.value = h;
    cell.font = { name: "Arial", size: 10, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = THIN;
  });
  head.height = 34;

  // Oldest first, so the register reads in the order the checking happened.
  const ordered = [...records].sort((a, b) =>
    a.qcNo.localeCompare(b.qcNo, undefined, { numeric: true })
  );

  ordered.forEach((rec, n) => {
    const row = ws.getRow(n + 2);
    qcRow(rec, checks).forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.border = THIN;
      if (v === "") return;
      // Dates go out as dates and weights as numbers, so the file sorts and
      // totals without anyone cleaning it first.
      const asDate = /^\d{4}-\d{2}-\d{2}$/.exec(v);
      if (asDate) {
        const [y, m, d] = v.split("-").map(Number);
        cell.value = new Date(y, m - 1, d);
        cell.numFmt = "dd/mm/yyyy";
        return;
      }
      const n2 = Number(v);
      cell.value = v !== "" && Number.isFinite(n2) && !/^0\d/.test(v) ? n2 : v;
    });

    // The verdict is what anyone opening this is looking for.
    const result = qcResult(rec.lines);
    const verdict = row.getCell(headers.length - 1);
    verdict.font = {
      name: "Arial", size: 10, bold: true,
      color: { argb: result === "fail" ? "FFB3261E" : result === "pass" ? "FF2F6B3A" : "FF6E6A5F" },
    };
    verdict.alignment = { horizontal: "center" };
  });

  const out = await wb.xlsx.writeBuffer();
  const u8 = out instanceof Uint8Array ? out : new Uint8Array(out as ArrayBuffer);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

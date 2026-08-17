import "server-only";
import ExcelJS from "exceljs";
import {
  MIX, STOCK_HEADERS, STOCK_WIDTHS, isMix, priceOf, type StockEntry,
} from "./stockBookConfig";
import type { PriceList } from "./priceList";

// The stock book written back into the company's own workbook: the same three
// sheets, the same columns, the same split between a piece with one stone size
// and a piece with several.
//
// Values go out as numbers and dates as dates, so the file totals and sorts
// without anyone cleaning it first. Prices are worked out here rather than left
// as formulas — the figures are the same, and a file that has to recalculate to
// show its own contents is no use to anyone reading it on a phone.

const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" }, left: { style: "thin" },
  bottom: { style: "thin" }, right: { style: "thin" },
};

function header(ws: ExcelJS.Worksheet, titles: string[], widths: number[]) {
  ws.columns = titles.map((_, i) => ({
    width: widths[i] || 14,
    style: { font: { name: "Arial", size: 10 } },
  }));
  const row = ws.getRow(1);
  titles.forEach((t, i) => {
    const cell = row.getCell(i + 1);
    cell.value = t;
    cell.font = { name: "Arial", size: 10, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = THIN;
  });
}

const dateCell = (cell: ExcelJS.Cell, raw: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw || "");
  if (m) {
    cell.value = new Date(+m[1], +m[2] - 1, +m[3]);
    cell.numFmt = "dd/mm/yyyy";
  } else if (raw) cell.value = raw;
};

const WT = "0.000";
const MONEY = "0";

export async function buildStockWorkbook(
  entries: StockEntry[],
  prices: PriceList
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();

  // Oldest first, so the book reads as a register.
  const ordered = [...entries].sort((a, b) =>
    a.stockNo.localeCompare(b.stockNo, undefined, { numeric: true })
  );

  // --- Sheet 1: the price list everything was worked out from ---------------
  const pl = wb.addWorksheet("Price List", { views: [{ state: "frozen", ySplit: 3 }] });
  pl.getCell("A1").value = "Seyaa Diamond Jewellery Round Diamond Price List (EF-VS)";
  pl.mergeCells("A1:F1");
  pl.getCell("H1").value = "Seyaa Diamond Jewellery Fancy Diamond Price List (EF-VS)";
  pl.mergeCells("H1:M1");
  for (const a of ["A1", "H1"]) {
    pl.getCell(a).font = { name: "Arial", size: 11, bold: true };
    pl.getCell(a).alignment = { horizontal: "center" };
  }
  const plHead = [
    ["A2", "Product Code"], ["B2", "Sieve / Size"], ["C2", "Size (mm)"],
    ["D2", "Pointers"], ["E2", "Price ($)"], ["F2", "Price (₹)"],
    ["H2", "Product Code"], ["I2", "Shape"], ["J2", "Pointers"],
    ["K2", "Size (mm)"], ["L2", "Price ($)"], ["M2", "Price (₹)"],
  ];
  for (const [a, t] of plHead) {
    pl.getCell(a).value = t;
    pl.getCell(a).font = { name: "Arial", size: 10, bold: true };
    pl.getCell(a).border = THIN;
  }
  pl.columns.forEach((c, i) => { c.width = [16, 16, 20, 14, 11, 11, 3, 14, 18, 16, 22, 11, 11][i] || 12; });
  prices.round.forEach((r, i) => {
    const row = pl.getRow(3 + i);
    row.getCell(1).value = r.code; row.getCell(2).value = r.sieve;
    row.getCell(3).value = r.mm; row.getCell(4).value = r.pointers;
    row.getCell(5).value = r.usd; row.getCell(6).value = r.inr;
  });
  prices.fancy.forEach((f, i) => {
    const row = pl.getRow(3 + i);
    row.getCell(8).value = f.code; row.getCell(9).value = f.shape;
    row.getCell(10).value = f.pointers; row.getCell(11).value = f.mm;
    row.getCell(12).value = f.usd; row.getCell(13).value = f.inr;
  });
  // The rates, beside the tables, laid out as the original keeps them.
  const rateRows: [string, string, number, number, number, number][] = [
    ["O2", "Gold Price", prices.rates.gold.k14.usd, prices.rates.gold.k14.inr, prices.rates.gold.k18.usd, prices.rates.gold.k18.inr],
    ["O3", "Labour", prices.rates.labour.k14.usd, prices.rates.labour.k14.inr, prices.rates.labour.k18.usd, prices.rates.labour.k18.inr],
    ["O4", "Polki Labour", prices.rates.polkiLabour.k14.usd, prices.rates.polkiLabour.k14.inr, prices.rates.polkiLabour.k18.usd, prices.rates.polkiLabour.k18.inr],
  ];
  for (const [a, label] of [["O1", ""], ["P1", "14KT ($)"], ["Q1", "14KT (₹)"], ["R1", "18KT ($)"], ["S1", "18KT (₹)"]] as [string, string][]) {
    pl.getCell(a).value = label;
    pl.getCell(a).font = { name: "Arial", size: 10, bold: true };
  }
  rateRows.forEach(([addr, label, a, b, c, d]) => {
    const r = Number(addr.slice(1));
    pl.getCell(`O${r}`).value = label;
    pl.getCell(`P${r}`).value = a; pl.getCell(`Q${r}`).value = b;
    pl.getCell(`R${r}`).value = c; pl.getCell(`S${r}`).value = d;
  });
  ["O", "P", "Q", "R", "S"].forEach((c, i) => { pl.getColumn(15 + i).width = [16, 11, 11, 11, 11][i]; });

  // --- Sheet 2: STOCK, one row per piece ------------------------------------
  const st = wb.addWorksheet("STOCK", { views: [{ state: "frozen", ySplit: 1 }] });
  header(st, STOCK_HEADERS, STOCK_WIDTHS);

  let r = 2;
  for (const e of ordered) {
    const p = priceOf(prices, e);
    const mix = isMix(e);
    const one = e.lines[0];
    const row = st.getRow(r++);
    const put = (col: number, v: string | number | null, fmt?: string) => {
      const cell = row.getCell(col);
      cell.border = THIN;
      if (v === null || v === "") return;
      cell.value = v;
      if (fmt) cell.numFmt = fmt;
    };
    put(1, e.stockNo);
    dateCell(row.getCell(2), e.date); row.getCell(2).border = THIN;
    put(3, e.design); put(4, e.designNo); put(5, e.category);
    put(6, e.subCategory); put(7, e.subSubCategory); put(8, e.location);
    put(9, e.goldDetails); put(10, e.inchSize);
    put(11, num(e.grossWt), WT); put(12, num(e.netWt), WT);
    put(13, p.totalWeight || null, WT);
    // A piece with one stone size repeats its weight here, as the sheet does;
    // a MIX piece's breakup lives on the third sheet.
    put(14, mix ? p.totalWeight || null : num(one?.breakupWt), WT);
    put(15, mix ? p.totalPcs || null : num(one?.pcs));
    put(16, p.totalPcs || null, "0");
    put(17, mix ? MIX : p.pointer, mix ? undefined : "#,##0.00");
    put(18, mix ? MIX : one?.shape || null);
    put(19, mix ? MIX : one?.sieve || null);
    put(20, e.partyName);
    put(21, mix ? MIX : one?.code || null);
    // The workbook leaves a MIX row's money blank — the piece is priced on the
    // sheet that holds its lines — so this does too.
    if (!mix) {
      put(22, p.diamond.usd, MONEY); put(23, p.gold.usd, MONEY);
      put(24, p.labour.usd, MONEY); put(25, p.total.usd, MONEY);
      put(26, p.diamond.inr, MONEY); put(27, p.gold.inr, MONEY);
      put(28, p.labour.inr, MONEY); put(29, p.total.inr, MONEY);
    } else {
      for (let c = 22; c <= 29; c++) row.getCell(c).border = THIN;
    }
    put(30, e.comments);
  }

  // --- Sheet 3: the lines of every multi-stone piece -------------------------
  const md = wb.addWorksheet("Multiple Dia Entry", { views: [{ state: "frozen", ySplit: 1 }] });
  header(md, STOCK_HEADERS, STOCK_WIDTHS);

  let m = 2;
  for (const e of ordered) {
    if (!isMix(e)) continue;
    const p = priceOf(prices, e);
    const top = m;
    e.lines.forEach((l, i) => {
      const row = md.getRow(m++);
      const put = (col: number, v: string | number | null, fmt?: string) => {
        const cell = row.getCell(col);
        cell.border = THIN;
        if (v === null || v === "") return;
        cell.value = v;
        if (fmt) cell.numFmt = fmt;
      };
      put(1, e.stockNo);
      dateCell(row.getCell(2), e.date); row.getCell(2).border = THIN;
      put(3, e.design); put(4, e.designNo); put(5, e.category);
      put(6, e.subCategory); put(7, e.subSubCategory); put(8, e.location);
      put(9, e.goldDetails); put(10, e.inchSize);
      put(11, num(e.grossWt), WT); put(12, num(e.netWt), WT);
      put(13, p.totalWeight || null, WT);
      // Per line: its own weight, stones, pointer, shape, sieve, code and price.
      put(14, p.lines[i].breakupWt, WT);
      put(15, p.lines[i].pcs);
      put(16, p.totalPcs || null, "0");
      put(17, p.lines[i].pointer, "#,##0.00");
      put(18, l.shape); put(19, l.sieve); put(20, e.partyName); put(21, l.code);
      put(22, p.lines[i].diamond.usd, MONEY);
      put(26, p.lines[i].diamond.inr, MONEY);
      // Gold, labour and the piece's total belong to the piece, so they are
      // written once and ruled down its lines.
      if (i === 0) {
        put(23, p.gold.usd, MONEY); put(24, p.labour.usd, MONEY);
        put(25, p.total.usd, MONEY);
        put(27, p.gold.inr, MONEY); put(28, p.labour.inr, MONEY);
        put(29, p.total.inr, MONEY);
        put(30, e.comments);
      } else {
        for (const c of [23, 24, 25, 27, 28, 29, 30]) row.getCell(c).border = THIN;
      }
    });

    // The identity of the piece is written once and merged down its lines, as
    // in the workbook this replaces.
    const span = e.lines.length;
    if (span > 1) {
      const merged = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 16, 20, 23, 24, 25, 27, 28, 29, 30];
      for (const c of merged) {
        md.mergeCells(top, c, top + span - 1, c);
        md.getCell(top, c).alignment = { vertical: "middle", wrapText: true };
      }
    }
  }

  const out = await wb.xlsx.writeBuffer();
  const u8 = out instanceof Uint8Array ? out : new Uint8Array(out as ArrayBuffer);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

function num(v: string): number | null {
  const t = (v || "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

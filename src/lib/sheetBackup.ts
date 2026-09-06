import "server-only";
import { registerRows } from "./designRegister";
import { listPdSheets } from "./pdStore";
import { listDemands } from "./demandStore";
import { listReceiptChases } from "./receiptChaseStore";
import { STATUS_LABEL } from "./receiptChase";
import { listJangad } from "./jangadStore";
import { listStockEntries } from "./stockBookStore";
import { listMemos, listParties } from "./memoStore";
import { PARTY_KINDS } from "./memoFormat";
import { loadPrices } from "./priceStore";
import { allQcChecks, listQcRecords } from "./qcStore";
import { EXPORT_COLUMNS, JANGAD_HEADERS } from "./jangadConfig";
import { isMix, priceOf } from "./stockBookConfig";
import { qcHeaders, qcRow } from "./qcConfig";
import { parseDesignNo, pieceCount } from "./designNo";
import { formatDiaLines } from "./pdConfig";
import { isSheetConfigured, sheetTab, writeTab } from "./googleSheets";

// A readable copy of the whole portal in the office's own Google Sheet, one tab
// per module, rewritten from scratch every night.
//
// This is a copy, not a second system of record. The portal's blob storage is
// the record and the nightly file on the office PC is the restorable backup;
// the sheet exists so anyone can open a browser and look, and so a year of work
// is legible without the portal being up at all.
//
// Every tab is written whole rather than appended to, for the same reason the
// design register is: an edited sheet, a deleted row, or a sync that ran twice
// all come out the same.

const money = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) && n !== 0 ? n.toFixed(2) : "";
const numText = (n: number | null | undefined, dp = 3) =>
  typeof n === "number" && Number.isFinite(n) && n !== 0 ? String(parseFloat(n.toFixed(dp))) : "";

// --- PD Sheets ---------------------------------------------------------------

export const PD_HEADER = [
  "PD No.", "Design Number", "Category", "Sub-Category", "Sub-Sub-Category",
  "Type", "Pieces", "TDW (cts)", "Dia. Quality", "Dia. Shape",
  "Dia. Weight & Pointers", "Gold Purity", "Gold Colour", "Gold Weight",
  "Size", "Locks", "Zone", "Order Type", "Quantity", "Price Range",
  "Assigned To", "Assigned Date", "Delivery Date", "Order By",
  "PD Merchandiser", "Remarks", "Made By", "Last Edited By", "Last Updated",
];

async function pdRows(): Promise<string[][]> {
  const sheets = await listPdSheets();
  const rows = sheets.map((s) => {
    const run = parseDesignNo(s.sku);
    const pieces = s.sku.trim() ? pieceCount(run) : 0;
    // A sheet made before the size picker existed only has the typed line, so
    // fall back to it rather than showing an empty column.
    const dia = s.diaLines?.length ? formatDiaLines(s.diaLines) : s.diaWeightPointers;
    return [
      s.pdNo, s.sku, s.category || s.product, s.subCategory, s.subSubCategory,
      s.type, pieces ? String(pieces) : "", s.tdw, s.diaQuality, s.diaShape,
      dia, s.goldPurity, s.goldColor, s.goldWeight,
      s.size, s.locks, s.zone, s.orderType, s.quantity, s.priceRange,
      s.assignedTo, s.assignedDate, s.deliveryDate, s.orderBy,
      s.pdMerchandiser, s.remarks,
      s.createdBy || "", s.updatedBy || "", (s.updatedAt || "").slice(0, 10),
    ];
  });
  rows.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  return [PD_HEADER, ...rows];
}

// --- Diamond Demand ----------------------------------------------------------

export const DEMAND_HEADER = [
  "Demand No.", "Date", "PD No.", "Issued To", "Design Number",
  "Diamond Shape", "Diamond Pointers", "No. of Pcs", "Bags", "CVD / HPHT",
  "Comments", "Notes",
];

async function demandRows(): Promise<string[][]> {
  const demands = await listDemands();
  const rows: string[][] = [];
  for (const d of demands) {
    // One line per diamond size, as the demand is worked from — a demand with
    // no lines still appears, so nothing goes missing from the copy.
    if (!d.rows.length) {
      rows.push([d.demandNo, d.date, d.pdNo || "", d.issuedTo, "", "", "", "", "", "", "", d.notes]);
      continue;
    }
    for (const r of d.rows) {
      rows.push([
        d.demandNo, d.date, d.pdNo || "", d.issuedTo, r.designNo,
        r.shape, r.pointers, r.pcs, r.bags, r.growth, r.comments, d.notes,
      ]);
    }
  }
  rows.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  return [DEMAND_HEADER, ...rows];
}

// --- Waiting on diamonds -----------------------------------------------------
// Which demands were left waiting for their bags, how long for, and how many
// times the diamond team had to be chased. The demand tab says what was asked
// for; this says what it cost to get it.

export const RECEIPT_HEADER = [
  "Demand No.", "Design Number", "Demand Date", "Issued To", "PD No.",
  "Issued At", "Status", "Reminders Sent", "Jangad Entry", "Closed By",
  "Waited (hours)",
];

async function receiptRows(): Promise<string[][]> {
  const chases = await listReceiptChases();
  const rows = chases.map((c) => {
    const end = c.completedAt ? Date.parse(c.completedAt) : Date.now();
    const hours = (end - Date.parse(c.issuedAt)) / 3_600_000;
    return [
      c.demandNo, c.designNumber, c.demandDate, c.issuedTo, c.pdNo,
      (c.issuedAt || "").slice(0, 16).replace("T", " "),
      STATUS_LABEL[c.status] || c.status, String(c.reminderNumber),
      c.jangadRef || "", c.closedBy || "",
      Number.isFinite(hours) ? hours.toFixed(1) : "",
    ];
  });
  rows.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  return [RECEIPT_HEADER, ...rows];
}

// --- Diamond Jangad ----------------------------------------------------------
// The accounts workbook's own columns, in its own order, plus where the row
// came from — which the workbook has no column for but the portal knows.

export const JANGAD_HEADER = [...JANGAD_HEADERS, "PD No.", "Demand No.", "Design Run"];

async function jangadRows(): Promise<string[][]> {
  const rows = await listJangad();
  const out = rows.map((r) => [
    ...EXPORT_COLUMNS.map((c) => r[c.key] || ""),
    r.pdNo || "", r.demandNo || "", r.runNo || "",
  ]);
  return [JANGAD_HEADER, ...out];
}

// --- Stock Book --------------------------------------------------------------
// One row per diamond size rather than per piece: a MIX piece repeats its
// identity down its sizes, so the tab can be filtered and totalled without
// anyone having to look up a second sheet.

export const STOCK_HEADER = [
  "Sr. No.", "Date", "Design", "Design Number", "Category", "Sub-Category",
  "Sub-Sub-Category", "Location", "Gold Details", "Inch Size",
  "Gross Weight", "Net Weight", "Total Diamond Weight", "Total Dia Pcs.",
  "MIX", "Diamond Weight Breakup", "Dia Pcs.", "Pointers", "Shape",
  "Sieve / Size", "Product Code", "Party Name", "Manufacturer",
  "Diamond Price ($)", "Gold Price ($)", "Labour ($)", "Total ($)",
  "Diamond Price (Rs.)", "Gold Price (Rs.)", "Labour (Rs.)", "Total (Rs.)",
  "PD No.", "Demand Nos.", "Memo Nos.", "Comments",
];

async function stockRows(): Promise<string[][]> {
  const [entries, prices] = await Promise.all([listStockEntries(), loadPrices()]);
  const rows: string[][] = [];
  for (const e of entries) {
    const p = priceOf(prices, e);
    const mix = isMix(e);
    const identity = [
      e.stockNo, e.date, e.design, e.designNo, e.category, e.subCategory,
      e.subSubCategory, e.location, e.goldDetails, e.inchSize,
      e.grossWt, e.netWt, numText(p.totalWeight), p.totalPcs ? String(p.totalPcs) : "",
      mix ? "MIX" : "",
    ];
    // Each stone size carries its own diamond money. Gold, labour and the
    // piece's total belong to the piece, so they are written on its first line
    // and not repeated down the rest — as the workbook has them.
    const tail = (first: boolean, dia: { usd: number; inr: number }) => [
      e.partyName, e.mfgName || "",
      money(dia.usd), first ? money(p.gold.usd) : "",
      first ? money(p.labour.usd) : "", first ? money(p.total.usd) : "",
      money(dia.inr), first ? money(p.gold.inr) : "",
      first ? money(p.labour.inr) : "", first ? money(p.total.inr) : "",
      e.pdNo || "", (e.demandNos || []).join(", "), (e.memoNos || []).join(", "),
      first ? e.comments : "",
    ];

    if (!e.lines.length) {
      rows.push([...identity, "", "", "", "", "", "", ...tail(true, p.diamond)]);
      continue;
    }
    e.lines.forEach((l, i) => {
      const pl = p.lines[i];
      rows.push([
        ...identity,
        numText(pl?.breakupWt), pl?.pcs ? String(pl.pcs) : l.pcs,
        numText(pl?.pointer, 2), l.shape, l.sieve, l.code,
        ...tail(i === 0, pl?.diamond || { usd: 0, inr: 0 }),
      ]);
    });
  }
  rows.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  return [STOCK_HEADER, ...rows];
}

// --- QC ----------------------------------------------------------------------

async function qcRows(): Promise<string[][]> {
  const [records, checks] = await Promise.all([listQcRecords(), allQcChecks()]);
  const ordered = [...records].sort((a, b) =>
    a.qcNo.localeCompare(b.qcNo, undefined, { numeric: true })
  );
  return [qcHeaders(checks), ...ordered.map((r) => qcRow(r, checks))];
}

// --- Memos -------------------------------------------------------------------

export const MEMO_HEADER = [
  "Memo No.", "Date", "Kind", "To", "Through", "Mobile", "Purpose",
  "Stock Numbers", "Total Pcs", "Gross Weight", "Fine Weight",
  "Against Memo", "Comment",
];

async function memoRows(): Promise<string[][]> {
  const memos = await listMemos();
  const rows = memos.map((m) => [
    m.memoNo, m.date, m.kind === "gold" ? "Gold" : "Jewellery",
    m.to, m.through, m.mobile, m.purpose,
    m.kind === "gold"
      ? m.goldItems.map((g) => g.description).filter(Boolean).join(", ")
      : m.items.flatMap((i) => i.stockNos).join(", "),
    m.totalPcs ? String(m.totalPcs) : "",
    numText(m.totalGrossWt), numText(m.totalFineWt),
    m.againstMemoNo || "", m.comment,
  ]);
  rows.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  return [MEMO_HEADER, ...rows];
}

// --- Lists -------------------------------------------------------------------
// Every controlled list the office keeps: the categories a design can be, the
// manufacturers work goes to, and the QC checks each category is looked over
// for. Names alone are not enough — a check means nothing without the category
// it belongs to — so what each entry sits under is a column of its own.

export const LISTS_HEADER = ["List", "Belongs to", "Name", "Short code"];

async function listRows(): Promise<string[][]> {
  const all = await Promise.all(PARTY_KINDS.map((k) => listParties(k.key)));
  const nameOf = new Map<string, string>();
  all.flat().forEach((p) => nameOf.set(p.id, p.name));

  const rows: string[][] = [];
  PARTY_KINDS.forEach((kind, i) => {
    const entries = [...all[i]].sort((a, b) => {
      const pa = nameOf.get(a.parentId || "") || "";
      const pb = nameOf.get(b.parentId || "") || "";
      return pa.localeCompare(pb) || a.name.localeCompare(b.name);
    });
    for (const e of entries) {
      rows.push([kind.label, nameOf.get(e.parentId || "") || "", e.name, e.code || ""]);
    }
  });
  return [LISTS_HEADER, ...rows];
}

// --- The sync itself ---------------------------------------------------------

export type TabResult = { tab: string; rows: number; error?: string };

// Design numbers keep whichever tab GOOGLE_SHEET_TAB names, so an existing
// sheet is not renamed under the office's feet.
function tabs(): { tab: string; build: () => Promise<string[][]> }[] {
  return [
    { tab: sheetTab(), build: registerRows },
    { tab: "PD Sheets", build: pdRows },
    { tab: "Diamond Demand", build: demandRows },
    { tab: "Diamond Receipts", build: receiptRows },
    { tab: "Diamond Jangad", build: jangadRows },
    { tab: "Stock Book", build: stockRows },
    { tab: "QC", build: qcRows },
    { tab: "Memos", build: memoRows },
    { tab: "Lists", build: listRows },
  ];
}

// India, where the office is and where midnight means midnight.
export function istStamp(now = new Date()): string {
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return `${ist.toISOString().slice(0, 10)} ${ist.toISOString().slice(11, 16)} IST`;
}

// Every tab's rows, without writing anything.
//
// This is what a Google Apps Script attached to the sheet asks for: the script
// runs as its owner and writes the rows itself, so the sheet needs no service
// account, no Google Cloud project and no sharing. Same builders either way —
// the two routes into the sheet can never show different figures.
export async function buildAllTabs(): Promise<{ tab: string; rows: string[][] }[]> {
  const out: { tab: string; rows: string[][] }[] = [];
  for (const { tab, build } of tabs()) {
    try {
      out.push({ tab, rows: await build() });
    } catch {
      // One module failing must not cost the others their copy. An empty tab
      // is left out rather than clearing what is already in the sheet.
    }
  }
  return out;
}

// Writes every tab. One module failing must not cost the others their copy, so
// each is caught on its own and reported.
export async function syncEverythingToSheet(): Promise<TabResult[]> {
  if (!isSheetConfigured()) throw new Error("The Google Sheet is not set up yet.");

  const results: TabResult[] = [];
  for (const { tab, build } of tabs()) {
    try {
      results.push({ tab, rows: await writeTab(tab, await build()) });
    } catch (err) {
      results.push({
        tab, rows: 0,
        error: err instanceof Error ? err.message : "Could not write this tab.",
      });
    }
  }

  // Last of all, a tab saying when this ran and what went in — so anyone
  // opening the sheet can tell at a glance whether last night's copy happened.
  const log = [
    ["Last backup", istStamp()],
    [],
    ["Tab", "Rows", "Result"],
    ...results.map((r) => [r.tab, String(r.rows), r.error || "OK"]),
  ];
  await writeTab("Backup Log", log).catch(() => {});
  return results;
}

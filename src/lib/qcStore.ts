// Read/write layer for the QC tracker. One row per stock piece, keyed by Stock
// No. Uses "listTab" to read and "replaceByKey" to create/update (auto-creates
// the tab).
import { sheetCall } from "./sheetStore";
import { QC_TAB, QC_HEADERS, QC_CHECKS, deriveResult } from "./qcConfig";

export type QcItem = { check: string; value: string; remark: string }; // value: "YES" | "NO" | ""

export type QcRecord = {
  stockNo: string;
  designName: string;
  designNumber: string;
  goldDetails: string;
  location: string;
  inchSize: string;
  grossWeight: string;
  netWeight: string;
  totalDiamondWeight: string;
  totalDiaPcs: string;
  manufacturerName: string;
  date: string; // dd/mm/yyyy (blank = today)
  checkedBy: string;
  items: QcItem[];
  result: string; // PASS | FAIL | PENDING (derived)
  comments: string;
};

const KEY_HEADER = "Stock No.";

function escapeCell(v: string): string {
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}
function escapeIdCell(v: string): string {
  return /^\d+$/.test(v) ? "'" + v : escapeCell(v);
}
const TEXT_ID = new Set<string>(["Stock No.", "Design Number"]);

function today(): string {
  return new Date().toLocaleDateString("en-GB");
}

function toObjects(headers: string[], rows: string[][]): Record<string, string>[] {
  return rows.map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => { o[h] = r[i] == null ? "" : String(r[i]); });
    return o;
  });
}

function toRecord(r: Record<string, string>): QcRecord {
  const items: QcItem[] = QC_CHECKS.map((c) => ({
    check: c,
    value: r[c] || "",
    remark: r[`${c} Remark`] || "",
  }));
  return {
    stockNo: r["Stock No."] || "",
    designName: r["Design Name"] || "",
    designNumber: r["Design Number"] || "",
    goldDetails: r["Gold Details"] || "",
    location: r["Location"] || "",
    inchSize: r["Inch Size"] || "",
    grossWeight: r["Gross Weight"] || "",
    netWeight: r["Net Weight"] || "",
    totalDiamondWeight: r["Total Diamond Weight"] || "",
    totalDiaPcs: r["Total Dia Pcs"] || "",
    manufacturerName: r["Manufacturer"] || "",
    date: r["QC Date"] || "",
    checkedBy: r["Checked By"] || "",
    items,
    result: r["Result"] || "",
    comments: r["Comments"] || "",
  };
}

export async function listQc(): Promise<QcRecord[]> {
  try {
    const data = await sheetCall<{ ok: true; headers: string[]; rows: string[][] }>({
      action: "listTab",
      tab: QC_TAB,
    });
    const objs = toObjects(data.headers || (QC_HEADERS as readonly string[]).slice(), data.rows || []);
    const byStock = new Map<string, QcRecord>();
    for (const o of objs) {
      if (!o["Stock No."]) continue;
      byStock.set(o["Stock No."], toRecord(o));
    }
    const list = Array.from(byStock.values());
    list.sort((a, b) => b.stockNo.localeCompare(a.stockNo, undefined, { numeric: true }));
    return list;
  } catch (e) {
    console.error("[qc] failed to list:", e instanceof Error ? e.message : e);
    return [];
  }
}

export async function getQc(stockNo: string): Promise<QcRecord | null> {
  const all = await listQc();
  return all.find((q) => q.stockNo === stockNo) || null;
}

function buildRow(rec: QcRecord): string[] {
  const byCheck = new Map(rec.items.map((i) => [i.check, i]));
  const get = (h: string): string => {
    switch (h) {
      case "Stock No.": return rec.stockNo;
      case "Design Name": return rec.designName;
      case "Design Number": return rec.designNumber;
      case "Gold Details": return rec.goldDetails;
      case "Location": return rec.location;
      case "Inch Size": return rec.inchSize;
      case "Gross Weight": return rec.grossWeight;
      case "Net Weight": return rec.netWeight;
      case "Total Diamond Weight": return rec.totalDiamondWeight;
      case "Total Dia Pcs": return rec.totalDiaPcs;
      case "Manufacturer": return rec.manufacturerName;
      case "QC Date": return rec.date || today();
      case "Checked By": return rec.checkedBy;
      case "Result": return rec.result;
      case "Comments": return rec.comments;
    }
    // check value or remark columns
    if (h.endsWith(" Remark")) {
      const c = h.slice(0, -" Remark".length);
      return byCheck.get(c)?.remark || "";
    }
    return byCheck.get(h)?.value || "";
  };
  return QC_HEADERS.map((h) => (TEXT_ID.has(h) ? escapeIdCell(get(h)) : escapeCell(get(h))));
}

export async function saveQc(rec: QcRecord): Promise<string> {
  // Always (re)derive the result from the answers so it stays consistent.
  const withResult: QcRecord = { ...rec, result: deriveResult(rec.items.map((i) => i.value)) };
  await sheetCall({
    action: "replaceByKey",
    tab: QC_TAB,
    keyHeader: KEY_HEADER,
    keyValue: rec.stockNo,
    headers: QC_HEADERS,
    rows: [buildRow(withResult)],
  });
  return rec.stockNo;
}

// Email the list of stock numbers currently failing QC (only the numbers, one
// per line). Best-effort: a missing "email" action or any error is swallowed so
// it never breaks the QC save. The Apps Script sends from the owner's Gmail; an
// optional QC_ALERT_EMAIL env var overrides the recipient.
export async function emailFailedStockNumbers(): Promise<void> {
  try {
    const all = await listQc();
    const failed = all.filter((q) => q.result === "FAIL").map((q) => q.stockNo);
    if (!failed.length) return;
    await sheetCall({
      action: "email",
      to: process.env.QC_ALERT_EMAIL || "",
      subject: "QC Failed — Seyaa",
      body: failed.join("\n"),
    });
  } catch (e) {
    console.error("[qc] failure email not sent:", e instanceof Error ? e.message : e);
  }
}

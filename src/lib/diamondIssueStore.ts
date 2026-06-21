// Read/write layer for the "Diamond Issue to Manufacturer" tracker. It talks
// to the same Google Apps Script Web App as orders, but against the dedicated
// "Diamond Issue" tab. One issue is keyed by its Memo No.; each diamond line
// is one sheet row. Calculated columns (Total Price, Difference, Addition,
// Average) are computed here and written into the sheet so it reads exactly
// like the owner's original Excel.
import { sheetCall } from "./sheetStore";
import {
  DIAMOND_ISSUE_TAB,
  DIAMOND_ISSUE_HEADERS,
  ISSUE_LINE_FIELD_NAMES,
  parseNum,
  round2,
} from "./diamondIssueConfig";

// A diamond line as entered at issue time + optional reconciliation values.
export type IssueLine = {
  values: Record<string, string>; // keyed by ISSUE_LINE_FIELD_NAMES
  diaCtsUsed?: string;
  diaPcsUsed?: string;
};

export type NewIssue = {
  memoNo: string;
  designNumber: string;
  subDesignNo: string;
  product: string;
  lines: IssueLine[];
};

// Reconstructed issue for display.
export type IssueLineView = {
  values: Record<string, string>;
  diaCtsUsed: string;
  diaPcsUsed: string;
  differenceDiaUsed: string;
  totalPrice: string;
};
export type Issue = {
  memoNo: string;
  date: string;
  designNumber: string;
  subDesignNo: string;
  product: string;
  status: string;
  receivedDate: string;
  additionOfTotalPrice: string;
  averagePrice: string;
  lines: IssueLineView[];
};

const KEY_HEADER = "Memo No.";

// Sheets treats a leading = + - @ as a formula; force plain text. (Same trick
// used for orders — diamond sizes like "+1-1.5 …" start with +.)
function escapeCell(v: string): string {
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

// Build the full set of sheet rows for one issue, computing every derived
// column. `date`/`status`/`receivedDate` are memo-level and repeated on each
// row; Addition/Average sit on the first row only (a per-memo subtotal).
function buildRows(issue: {
  memoNo: string;
  date: string;
  designNumber: string;
  subDesignNo: string;
  product: string;
  status: string;
  receivedDate: string;
  lines: IssueLine[];
}): string[][] {
  // Memo-level totals.
  let additionTotal = 0;
  let totalCarats = 0;
  const perLineTotal: number[] = [];
  for (const ln of issue.lines) {
    const carats = parseNum(ln.values["Diamond Carats"]);
    const price = parseNum(ln.values["Price"]);
    const total = round2(price * carats);
    perLineTotal.push(total);
    additionTotal += total;
    totalCarats += carats;
  }
  additionTotal = round2(additionTotal);
  const averagePrice = totalCarats > 0 ? round2(additionTotal / totalCarats) : 0;

  return issue.lines.map((ln, i) => {
    const carats = parseNum(ln.values["Diamond Carats"]);
    const ctsUsed = ln.diaCtsUsed ?? "";
    const hasUsed = String(ctsUsed).trim() !== "";
    const difference = hasUsed ? round2(carats - parseNum(ctsUsed)) : "";

    const get = (header: string): string => {
      switch (header) {
        case "Date":
          return issue.date;
        case "Design Number":
          return issue.designNumber;
        case "Sub Design No":
          return issue.subDesignNo;
        case "Product":
          return issue.product;
        case "Memo No.":
          return issue.memoNo;
        case "Dia Cts Used":
          return String(ctsUsed);
        case "Dia Pcs Used":
          return String(ln.diaPcsUsed ?? "");
        case "Difference Dia Used":
          return difference === "" ? "" : String(difference);
        case "Total Price":
          return String(perLineTotal[i]);
        case "Addition of Total Price":
          return i === 0 ? String(additionTotal) : "";
        case "Average Price":
          return i === 0 ? String(averagePrice) : "";
        case "Status":
          return issue.status;
        case "Received date":
          return issue.receivedDate;
      }
      if (ISSUE_LINE_FIELD_NAMES.includes(header)) return ln.values[header] ?? "";
      return "";
    };

    return DIAMOND_ISSUE_HEADERS.map((h) => escapeCell(get(h)));
  });
}

// Create a brand-new issue (status ISSUED, date = today).
export async function createIssue(issue: NewIssue): Promise<string> {
  const today = new Date().toLocaleDateString("en-GB"); // dd/mm/yyyy
  const rows = buildRows({
    memoNo: issue.memoNo,
    date: today,
    designNumber: issue.designNumber,
    subDesignNo: issue.subDesignNo,
    product: issue.product,
    status: "ISSUED",
    receivedDate: "",
    lines: issue.lines,
  });

  await sheetCall({
    action: "replaceByKey",
    tab: DIAMOND_ISSUE_TAB,
    keyHeader: KEY_HEADER,
    keyValue: issue.memoNo,
    headers: DIAMOND_ISSUE_HEADERS,
    rows,
  });
  return issue.memoNo;
}

function toObjects(headers: string[], rows: string[][]): Record<string, string>[] {
  return rows.map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => {
      o[h] = r[i] == null ? "" : String(r[i]);
    });
    return o;
  });
}

function groupIssues(objs: Record<string, string>[]): Issue[] {
  const byMemo = new Map<string, Issue>();
  for (const r of objs) {
    const memo = r["Memo No."];
    if (!memo) continue;
    if (!byMemo.has(memo)) {
      byMemo.set(memo, {
        memoNo: memo,
        date: r["Date"] || "",
        designNumber: r["Design Number"] || "",
        subDesignNo: r["Sub Design No"] || "",
        product: r["Product"] || "",
        status: r["Status"] || "ISSUED",
        receivedDate: r["Received date"] || "",
        additionOfTotalPrice: "",
        averagePrice: "",
        lines: [],
      });
    }
    const issue = byMemo.get(memo)!;
    // Addition/Average live on the first row; pick them up whenever present.
    if (!issue.additionOfTotalPrice && r["Addition of Total Price"]) {
      issue.additionOfTotalPrice = r["Addition of Total Price"];
    }
    if (!issue.averagePrice && r["Average Price"]) {
      issue.averagePrice = r["Average Price"];
    }
    const values: Record<string, string> = {};
    for (const f of ISSUE_LINE_FIELD_NAMES) values[f] = r[f] || "";
    issue.lines.push({
      values,
      diaCtsUsed: r["Dia Cts Used"] || "",
      diaPcsUsed: r["Dia Pcs Used"] || "",
      differenceDiaUsed: r["Difference Dia Used"] || "",
      totalPrice: r["Total Price"] || "",
    });
  }
  return Array.from(byMemo.values());
}

export async function listIssues(): Promise<Issue[]> {
  const data = await sheetCall<{ ok: true; headers: string[]; rows: string[][] }>({
    action: "listTab",
    tab: DIAMOND_ISSUE_TAB,
  });
  const objs = toObjects(data.headers || (DIAMOND_ISSUE_HEADERS as readonly string[]).slice(), data.rows || []);
  const issues = groupIssues(objs);
  // Newest memo first.
  issues.sort((a, b) => b.memoNo.localeCompare(a.memoNo, undefined, { numeric: true }));
  return issues;
}

export async function getIssue(memoNo: string): Promise<Issue | null> {
  const all = await listIssues();
  return all.find((i) => i.memoNo === memoNo) || null;
}

// Apply reconciliation (used carats/pcs per line + status + received date) and
// rewrite the memo's rows so every derived column stays correct.
export type ReconcileInput = {
  memoNo: string;
  status: string;
  receivedDate: string;
  used: { ctsUsed: string; pcsUsed: string }[]; // aligned to line order
};

export async function reconcileIssue(input: ReconcileInput): Promise<void> {
  const existing = await getIssue(input.memoNo);
  if (!existing) throw new Error(`Memo "${input.memoNo}" not found`);

  const lines: IssueLine[] = existing.lines.map((ln, i) => ({
    values: ln.values,
    diaCtsUsed: input.used[i]?.ctsUsed ?? ln.diaCtsUsed,
    diaPcsUsed: input.used[i]?.pcsUsed ?? ln.diaPcsUsed,
  }));

  const rows = buildRows({
    memoNo: existing.memoNo,
    date: existing.date,
    designNumber: existing.designNumber,
    subDesignNo: existing.subDesignNo,
    product: existing.product,
    status: input.status,
    receivedDate: input.receivedDate,
    lines,
  });

  await sheetCall({
    action: "replaceByKey",
    tab: DIAMOND_ISSUE_TAB,
    keyHeader: KEY_HEADER,
    keyValue: existing.memoNo,
    headers: DIAMOND_ISSUE_HEADERS,
    rows,
  });
}

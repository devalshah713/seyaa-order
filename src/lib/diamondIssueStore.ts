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
  DIAMOND_ISSUE_EXPORT_HEADERS,
  DIAMOND_ISSUE_EXPORT_NUMERIC,
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
  factory: string;
  date: string; // issue date as picked (yyyy-mm-dd); blank = today
  comments: string;
  lines: IssueLine[]; // each line's values may include "Product"
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
  factory: string;
  comments: string;
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

// Identifier columns that must round-trip EXACTLY. Google Sheets auto-converts
// a purely-numeric string like "001" into the number 1 (dropping the leading
// zeros), which then no longer matches the memo/design key on read-back and
// causes 404s. A leading apostrophe forces Sheets to keep it as text (the
// apostrophe itself is not stored). Non-numeric values fall back to the normal
// formula-escape.
const TEXT_ID_HEADERS = new Set<string>([
  "Memo No.",
  "Design Number",
  "Sub Design No",
  "Certi No.",
]);
function escapeIdCell(v: string): string {
  return /^\d+$/.test(v) ? "'" + v : escapeCell(v);
}

// Build the full set of sheet rows for one issue, computing every derived
// column. `date`/`status`/`receivedDate` are memo-level and repeated on each
// row; Addition/Average sit on the first row only (a per-memo subtotal).
function buildRows(issue: {
  memoNo: string;
  date: string;
  designNumber: string;
  subDesignNo: string;
  factory: string;
  comments: string;
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
        case "Factory":
          return issue.factory;
        case "Comments":
          return i === 0 ? issue.comments : "";
      }
      if (ISSUE_LINE_FIELD_NAMES.includes(header)) return ln.values[header] ?? "";
      return "";
    };

    return DIAMOND_ISSUE_HEADERS.map((h) =>
      TEXT_ID_HEADERS.has(h) ? escapeIdCell(get(h)) : escapeCell(get(h))
    );
  });
}

// Format the picked issue date (yyyy-mm-dd) as dd/mm/yyyy; blank = today.
function formatIssueDate(d: string): string {
  if (!d) return new Date().toLocaleDateString("en-GB");
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}

// Create an issue, or add more bags to an existing memo number.
// A memo number (e.g. the pre-printed "397") is entered by the user and a memo
// can hold several bags of diamonds. If the memo already exists, the new bags
// are appended to it (existing bags are kept) rather than overwriting it, so a
// memo accumulates its bags safely. Memo-level fields (date/design/factory)
// keep the existing memo's values when adding to one.
export async function createIssue(issue: NewIssue): Promise<string> {
  const existing = await getIssue(issue.memoNo);

  const existingLines: IssueLine[] = existing
    ? existing.lines.map((ln) => ({
        values: ln.values,
        diaCtsUsed: ln.diaCtsUsed,
        diaPcsUsed: ln.diaPcsUsed,
      }))
    : [];
  const mergedLines = [...existingLines, ...issue.lines];

  const rows = buildRows({
    memoNo: issue.memoNo,
    date: existing ? existing.date : formatIssueDate(issue.date),
    designNumber: existing && existing.designNumber ? existing.designNumber : issue.designNumber,
    subDesignNo: existing && existing.subDesignNo ? existing.subDesignNo : issue.subDesignNo,
    factory: existing && existing.factory ? existing.factory : issue.factory,
    comments: existing && existing.comments ? existing.comments : issue.comments,
    status: existing ? existing.status : "PENDING",
    receivedDate: existing ? existing.receivedDate : "",
    lines: mergedLines,
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
        product: "",
        status: r["Status"] || "PENDING",
        receivedDate: r["Received date"] || "",
        factory: r["Factory"] || "",
        comments: "",
        additionOfTotalPrice: "",
        averagePrice: "",
        lines: [],
      });
    }
    const issue = byMemo.get(memo)!;
    if (!issue.comments && r["Comments"]) issue.comments = r["Comments"];
    // Product is per row; show the distinct set on the memo header.
    if (r["Product"] && !issue.product.split(", ").includes(r["Product"])) {
      issue.product = issue.product ? `${issue.product}, ${r["Product"]}` : r["Product"];
    }
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

// Distinct design numbers that actually have diamond issues, each with a count
// of memos and diamond lines — used to populate the export picker.
export type DesignSummary = { designNumber: string; memos: number; lines: number };
export async function listIssuedDesigns(): Promise<DesignSummary[]> {
  const issues = await listIssues();
  const byDesign = new Map<string, DesignSummary>();
  for (const i of issues) {
    const d = i.designNumber || "(no design)";
    const s = byDesign.get(d) || { designNumber: d, memos: 0, lines: 0 };
    s.memos += 1;
    s.lines += i.lines.length;
    byDesign.set(d, s);
  }
  return Array.from(byDesign.values()).sort((a, b) =>
    a.designNumber.localeCompare(b.designNumber, undefined, { numeric: true })
  );
}

// Build the export rows (one per diamond line) in the fixed template column
// order for the selected design numbers. Memo-level totals (Addition / Average)
// sit on each memo's first row only, exactly as in the sheet. Each value is a
// string or, for the numeric columns, a number when it is a clean number.
export async function buildExportRows(
  designNumbers: string[]
): Promise<(string | number | null)[][]> {
  const want = new Set(designNumbers);
  const issues = await listIssues();
  const selected = issues
    .filter((i) => want.has(i.designNumber || "(no design)"))
    // Group output by design, then by memo, for a tidy, readable export.
    .sort((a, b) => {
      const d = (a.designNumber || "").localeCompare(b.designNumber || "", undefined, { numeric: true });
      return d !== 0 ? d : a.memoNo.localeCompare(b.memoNo, undefined, { numeric: true });
    });

  const num = (v: string): string | number | null => {
    if (v == null || v === "") return null;
    return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
  };

  const rows: (string | number | null)[][] = [];
  for (const issue of selected) {
    issue.lines.forEach((ln, i) => {
      const cell: Record<string, string> = {
        "Date": issue.date,
        "Design Number": issue.designNumber,
        "Sub Design No": issue.subDesignNo,
        "Product": ln.values["Product"] || "",
        "Diamond Shape": ln.values["Diamond Shape"] || "",
        "SETTING": ln.values["SETTING"] || "",
        "Certi No.": ln.values["Certi No."] || "",
        "Diamond Size": ln.values["Diamond Size"] || "",
        "Diamond Pcs": ln.values["Diamond Pcs"] || "",
        "Diamond Carats": ln.values["Diamond Carats"] || "",
        "Cvd/Hpht": ln.values["Cvd/Hpht"] || "",
        "Price": ln.values["Price"] || "",
        "Memo No.": issue.memoNo,
        "Dia Cts Used": ln.diaCtsUsed || "",
        "Dia Pcs Used": ln.diaPcsUsed || "",
        "Difference Dia Used": ln.differenceDiaUsed || "",
        "Total Price": ln.totalPrice || "",
        "Addition of Total Price": i === 0 ? issue.additionOfTotalPrice : "",
        "Average Price": i === 0 ? issue.averagePrice : "",
        "Status": issue.status,
        "Received date": issue.receivedDate,
      };
      rows.push(
        DIAMOND_ISSUE_EXPORT_HEADERS.map((h) =>
          DIAMOND_ISSUE_EXPORT_NUMERIC.has(h) ? num(cell[h]) : cell[h] || null
        )
      );
    });
  }
  return rows;
}

// Apply reconciliation (used carats/pcs per line + status + received date) and
// rewrite the memo's rows so every derived column stays correct.
export type ReconcileInput = {
  memoNo: string;
  status: string;
  receivedDate: string;
  comments?: string;
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
    factory: existing.factory,
    comments: input.comments ?? existing.comments,
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

// The diamond jangad register — the accountant's entry after a demand is
// issued. The columns, their names and their order are taken verbatim from the
// company's "Diamond Jangad" workbook, so an export drops straight into the
// file the accounts team already uses.
//
// One flat row per piece of jewellery per diamond size, exactly as in the
// sheet. A row is filled in over three visits, which is what the sheet's three
// blocks of columns are:
//
//   1. Diamond Issue      diamonds go out against a design (A-M)
//   2. Jewellery Received what actually came back studded (N-Q)
//   3. Diamond Return     the extra stones handed back, then the piece's
//                         stock code and sale (R-Y)
//
// Everything is held as typed text rather than numbers: a half-entered weight
// like "1." has to survive being typed, and the export converts on the way out.

export type JangadStage = "issue" | "received" | "returned";

export type JangadField =
  | "date" | "designNo" | "subDesignNo" | "product" | "shape" | "setting"
  | "certiNo" | "size" | "pcs" | "carats" | "growth" | "price" | "memoNo"
  | "ctsUsed" | "pcsUsed" | "totalPrice" | "receivedDate"
  | "ctsReturn" | "pcsReturn" | "returnDate" | "status"
  | "stockCode" | "sellGivenDate" | "sellGivenStatus" | "comments";

export type JangadColumn = {
  key: JangadField;
  header: string; // exactly as the workbook spells it
  stage: JangadStage;
  kind: "text" | "date" | "number";
  width: number; // export column width
};

// The order here IS the workbook's column order. Do not reorder.
export const JANGAD_COLUMNS: JangadColumn[] = [
  { key: "date", header: "Date", stage: "issue", kind: "date", width: 12 },
  { key: "designNo", header: "Design Number", stage: "issue", kind: "text", width: 22 },
  { key: "subDesignNo", header: "Sub Design No", stage: "issue", kind: "text", width: 22 },
  { key: "product", header: "Product", stage: "issue", kind: "text", width: 18 },
  { key: "shape", header: "Diamond Shape", stage: "issue", kind: "text", width: 14 },
  { key: "setting", header: "SETTING", stage: "issue", kind: "text", width: 14 },
  { key: "certiNo", header: "Certi No.", stage: "issue", kind: "text", width: 16 },
  { key: "size", header: "Diamond Size", stage: "issue", kind: "text", width: 16 },
  { key: "pcs", header: "Diamond Pcs", stage: "issue", kind: "number", width: 12 },
  { key: "carats", header: "Diamond Carats", stage: "issue", kind: "number", width: 14 },
  { key: "growth", header: "Cvd/Hpht", stage: "issue", kind: "text", width: 11 },
  { key: "price", header: "Price", stage: "issue", kind: "number", width: 11 },
  { key: "memoNo", header: "Memo No.", stage: "issue", kind: "text", width: 14 },

  { key: "ctsUsed", header: "Dia Cts Used", stage: "received", kind: "number", width: 13 },
  { key: "pcsUsed", header: "Dia Pcs Used", stage: "received", kind: "number", width: 13 },
  { key: "totalPrice", header: "Total Price", stage: "received", kind: "number", width: 13 },
  { key: "receivedDate", header: "Received date", stage: "received", kind: "date", width: 13 },

  { key: "ctsReturn", header: "Difference Cts Return", stage: "returned", kind: "number", width: 18 },
  { key: "pcsReturn", header: "Diamond Pcs Return", stage: "returned", kind: "number", width: 17 },
  { key: "returnDate", header: "Date of Dia Return", stage: "returned", kind: "date", width: 16 },
  { key: "status", header: "Status", stage: "returned", kind: "text", width: 13 },
  { key: "stockCode", header: "Stock Code", stage: "returned", kind: "text", width: 13 },
  { key: "sellGivenDate", header: "Sell Given Date", stage: "returned", kind: "date", width: 14 },
  { key: "sellGivenStatus", header: "Sell Given Status", stage: "returned", kind: "text", width: 15 },
  { key: "comments", header: "Comments", stage: "returned", kind: "text", width: 30 },
];

export const JANGAD_HEADERS = JANGAD_COLUMNS.map((c) => c.header);
export const JANGAD_FIELDS = JANGAD_COLUMNS.map((c) => c.key);

export const STAGES: { key: JangadStage; label: string; blurb: string }[] = [
  {
    key: "issue",
    label: "Diamond Issue",
    blurb: "What went out against the design, taken from its PD sheet and demand.",
  },
  {
    key: "received",
    label: "Jewellery Received",
    blurb: "What came back studded in the jewellery.",
  },
  {
    key: "returned",
    label: "Diamond Return",
    blurb: "The extra stones handed back, then the piece's stock code and sale.",
  },
];

export function columnsFor(stage: JangadStage): JangadColumn[] {
  return JANGAD_COLUMNS.filter((c) => c.stage === stage);
}

export type JangadRow = Record<JangadField, string> & {
  id: string;
  // Where the row came from, so a jangad entry can be traced back.
  pdId?: string;
  pdNo?: string;
  demandNo?: string;
  createdAt: string;
  updatedAt: string;
};

export const BLANK_JANGAD: Record<JangadField, string> = JANGAD_FIELDS.reduce(
  (acc, k) => ({ ...acc, [k]: "" }),
  {} as Record<JangadField, string>
);

export const STATUSES = ["Issued", "Received", "Returned", "Closed", "Cancelled"];
export const SELL_STATUSES = ["Pending", "Given", "Sold", "Returned"];
export const SETTINGS = ["Prong", "Bezel", "Pave", "Channel", "Micro Pave", "Bar", "Invisible"];

// --- Numbers -----------------------------------------------------------------
// Blank is blank, not zero: an empty "Dia Cts Used" means nobody has counted
// yet, and showing 0.00 would read as "none used".

export function num(v: string): number | null {
  const t = (v || "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function round(n: number, dp: number): string {
  return String(parseFloat(n.toFixed(dp)));
}

// Carats issued = stones × the per-stone weight the sieve size carries.
export function caratsFor(pcs: string, pointer: string): string {
  const p = num(pcs);
  const w = num(pointer);
  if (p === null || w === null) return "";
  return round(p * w, 4);
}

export function totalPriceFor(ctsUsed: string, price: string): string {
  const c = num(ctsUsed);
  const p = num(price);
  if (c === null || p === null) return "";
  return round(c * p, 2);
}

// What should come back: everything issued that was not studded. The register
// still stores what was actually counted — this is the figure to check it
// against, not a replacement for the count.
export function expectedCtsReturn(row: Pick<JangadRow, "carats" | "ctsUsed">): string {
  const issued = num(row.carats);
  const used = num(row.ctsUsed);
  if (issued === null || used === null) return "";
  return round(issued - used, 4);
}

export function expectedPcsReturn(row: Pick<JangadRow, "pcs" | "pcsUsed">): string {
  const issued = num(row.pcs);
  const used = num(row.pcsUsed);
  if (issued === null || used === null) return "";
  return round(issued - used, 0);
}

// A row is short when what came back plus what was studded is less than what
// went out — the one thing this register exists to catch.
export function shortfall(row: JangadRow): { cts: string; pcs: string } | null {
  const issuedC = num(row.carats), usedC = num(row.ctsUsed), backC = num(row.ctsReturn);
  const issuedP = num(row.pcs), usedP = num(row.pcsUsed), backP = num(row.pcsReturn);

  let cts = "", pcs = "";
  if (issuedC !== null && usedC !== null && backC !== null) {
    const gap = issuedC - usedC - backC;
    if (Math.abs(gap) > 0.00005) cts = round(gap, 4);
  }
  if (issuedP !== null && usedP !== null && backP !== null) {
    const gap = issuedP - usedP - backP;
    if (gap !== 0) pcs = round(gap, 0);
  }
  return cts || pcs ? { cts, pcs } : null;
}

// The stage a row has reached, from what has actually been filled in. Used to
// suggest Status, never to overwrite what the accountant typed.
export function stageOf(row: JangadRow): JangadStage {
  if (row.returnDate || row.ctsReturn || row.pcsReturn) return "returned";
  if (row.receivedDate || row.ctsUsed || row.pcsUsed) return "received";
  return "issue";
}

export function suggestedStatus(row: JangadRow): string {
  const stage = stageOf(row);
  if (stage === "returned") return "Returned";
  if (stage === "received") return "Received";
  return "Issued";
}

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

import { lineGoesTo } from "./pdConfig";
import { joinDesignNo, matchDesign } from "./designNo";

export type JangadStage = "issue" | "received" | "returned";

export type JangadField =
  | "date" | "designNo" | "subDesignNo" | "product" | "shape" | "setting"
  | "certiNo" | "size" | "pcs" | "carats" | "growth" | "price" | "memoNo"
  | "mfgName" | "addOn"
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

// The order here is the order the columns are worked in on screen. It is the
// workbook's order too, with one addition: Mfg Name sits with the rest of the
// issue, next to the memo it went out on, because that is where it is filled
// in. The export puts it last instead — see EXPORT_COLUMNS.
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
  { key: "mfgName", header: "Mfg Name", stage: "issue", kind: "text", width: 18 },
  // Stones going out against a piece that already has its diamonds — a stone
  // broken at the factory, most often. Kept as its own column rather than a
  // note, so a month's replacements can be counted and set against the factory
  // that asked for them.
  { key: "addOn", header: "Add-on", stage: "issue", kind: "text", width: 10 },

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

export const JANGAD_FIELDS = JANGAD_COLUMNS.map((c) => c.key);

// The export's own order: A to Y exactly as the company's workbook has them, so
// a sheet exported from here still pastes into the file that already holds
// years of entries. Anything added since goes on the end rather than shifting
// a column out from under existing data.
const SHEET_ORDER: JangadField[] = [
  "date", "designNo", "subDesignNo", "product", "shape", "setting",
  "certiNo", "size", "pcs", "carats", "growth", "price", "memoNo",
  "ctsUsed", "pcsUsed", "totalPrice", "receivedDate",
  "ctsReturn", "pcsReturn", "returnDate", "status",
  "stockCode", "sellGivenDate", "sellGivenStatus", "comments",
  // --- beyond the original 25 ---
  "mfgName", "addOn",
];

export const EXPORT_COLUMNS: JangadColumn[] = SHEET_ORDER.map(
  (k) => JANGAD_COLUMNS.find((c) => c.key === k)!
);

export const JANGAD_HEADERS = EXPORT_COLUMNS.map((c) => c.header);

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

// --- Merged cells ------------------------------------------------------------
// On paper a design is written once and ruled down its own rows: the date, the
// design number, the product, the memo and the manufacturer are facts about the
// issue, not about each stone size, so repeating them five times is noise.
//
// What each stone size is — shape, size, pieces, carats, rate — stays on its own
// line even when two lines happen to read the same, because those are separate
// measurements that only look alike.
export const MERGE_BY_DESIGN: JangadField[] = [
  "date", "designNo", "product", "memoNo", "mfgName", "addOn",
];
export const MERGE_BY_PIECE: JangadField[] = ["subDesignNo"];

// A third kind: facts about the finished piece of jewellery rather than about
// one stone size in it. A bracelet has one stock code, goes out for sale on one
// day, in one state — the emerald line and the pear line in it cannot disagree.
//
// So these merge structurally, whatever the rows happen to hold, instead of
// only while they read alike: one box per piece, and writing in it writes to
// every row of that piece. The columns above merge on equal values because
// there a disagreement is real and worth seeing; here it would just be a stock
// code someone typed into the first line and not the other two.
export const MERGE_PER_PIECE: JangadField[] = [
  "stockCode", "sellGivenDate", "sellGivenStatus",
];

const MERGED = [...MERGE_BY_DESIGN, ...MERGE_BY_PIECE, ...MERGE_PER_PIECE];
export const isMergedColumn = (k: JangadField) => MERGED.includes(k);
export const isPerPieceColumn = (k: JangadField) => MERGE_PER_PIECE.includes(k);

type Cells = Record<JangadField, string>;

// Only rows sitting next to each other are joined. Two issues of the same
// design weeks apart are two blocks on the page, which is how they were made.
const designKey = (r: Cells) => `${r.designNo} ${r.date}`;
const pieceKey = (r: Cells) => `${designKey(r)} ${r.subDesignNo}`;

// For each mergeable column: the row a run starts on, and how many rows it
// covers. A row not in the map is inside a run above it and draws no cell.
export type MergeSpans = Map<JangadField, Map<number, number>>;

export function mergeSpans(rows: Cells[]): MergeSpans {
  const out: MergeSpans = new Map();
  for (const key of MERGED) {
    const perPiece = MERGE_BY_PIECE.includes(key) || MERGE_PER_PIECE.includes(key);
    const groupOf = perPiece ? pieceKey : designKey;
    // Per-piece facts merge across the piece whatever the cells say; everything
    // else merges only while it reads the same, so a value corrected on one
    // line shows rather than being hidden under the run above it.
    const sameValue = !MERGE_PER_PIECE.includes(key);
    const spans = new Map<number, number>();
    for (let i = 0; i < rows.length; ) {
      let n = 1;
      while (
        i + n < rows.length &&
        groupOf(rows[i + n]) === groupOf(rows[i]) &&
        (!sameValue || rows[i + n][key] === rows[i][key])
      ) n++;
      spans.set(i, n);
      i += n;
    }
    out.set(key, spans);
  }
  return out;
}

// What a merged box shows. Rows saved before a column merged can hold the value
// on one line only, so the first line that has one speaks for the group rather
// than the box reading empty because the top row happens to be.
export function mergedValue(
  rows: Cells[], start: number, span: number, key: JangadField
): string {
  for (let i = start; i < start + span && i < rows.length; i++) {
    if (rows[i][key].trim()) return rows[i][key];
  }
  return "";
}

export type JangadRow = Record<JangadField, string> & {
  id: string;
  // Where the row came from, so a jangad entry can be traced back.
  pdId?: string;
  pdNo?: string;
  demandNo?: string;
  // The whole design run as the PD sheet writes it. Not a workbook column —
  // the register splits a piece into design + sub, so this keeps the run
  // findable.
  runNo?: string;
  createdAt: string;
  updatedAt: string;
};

export const BLANK_JANGAD: Record<JangadField, string> = JANGAD_FIELDS.reduce(
  (acc, k) => ({ ...acc, [k]: "" }),
  {} as Record<JangadField, string>
);

// --- Which pieces to offer when issuing --------------------------------------
// Diamonds arrive a few bags at a time, so a design is issued over several
// visits and the picker has to be right about which visit this is.
export type PiecePick = { no: string; status: string; issued: boolean };

export function suggestedPieces(pieces: PiecePick[], namedPiece = ""): string[] {
  const free = pieces.filter((p) => !p.issued);
  // Searching for one piece means that piece — but not if its stones already
  // went out, which is a question rather than an instruction.
  if (namedPiece) {
    return free.some((p) => p.no === namedPiece) ? [namedPiece] : [];
  }
  const started = free.filter((p) => p.status === "production" || p.status === "ready");
  if (started.length) return started.map((p) => p.no);
  // Nothing has gone out against this design yet: everything still waiting is
  // offered, which is the ordinary first issue.
  if (!pieces.some((p) => p.issued)) {
    return free.filter((p) => p.status === "pending").map((p) => p.no);
  }
  // Otherwise this is a later batch. Nothing is pre-ticked: only the person
  // holding the bags knows which pieces they are for, and guessing here means
  // issuing stones against a piece that was never meant to have them.
  return [];
}

// --- Which diamond sizes belong to which piece -------------------------------
// The PD sheet says so, per size. A blank "Goes to" means every piece takes it,
// which is the ordinary case — a pair of earrings drawn with two pear sizes is
// two sizes in each earring. A size that names a piece goes only into that one,
// which is how a run drawn with a different size per bracelet is written.
//
// This used to be guessed from the counts, and the two cases are indist-
// inguishable that way: 2 sizes and 2 pieces is either two bracelets of one
// size each or two earrings of both, and they need opposite answers.
export function linesForPiece<T extends { pieces?: string }>(
  lines: T[],
  piece: string,
  run: string[]
): T[] {
  return lines.filter((l) => lineGoesTo(l, piece, run));
}

// --- Searching the register --------------------------------------------------
//
// What the box above the register means by a phrase, in one place because two
// callers now need the same answer and they must not drift apart: the register
// page, which asks the database to narrow the rows and then applies this to
// what came back, and JangadClient, which applies it again to the page it was
// given.
//
// Naming one piece means that piece, not the whole design it came from, so a
// piece-level hit wins outright when there is one. The register keeps the design
// and the piece in separate columns, so the number being searched for has to be
// put back together first.
export function searchJangad(rows: JangadRow[], needle: string): JangadRow[] {
  const phrase = (needle || "").trim();
  if (!phrase) return rows;
  const lower = phrase.toLowerCase();

  const byPiece = rows.filter((r) =>
    matchDesign(joinDesignNo(r.designNo, r.subDesignNo, ""), phrase)
  );
  if (byPiece.length) return byPiece;

  return rows.filter((r) => {
    if (r.designNo && matchDesign(r.designNo, phrase)) return true;
    // runNo is the whole run off the PD sheet ("…-63-67"), which no column
    // holds any more — matched as plain text so searching it still finds every
    // piece that was issued under it.
    return [r.runNo, r.memoNo, r.stockCode, r.certiNo, r.product,
            r.shape, r.size, r.status, r.mfgName]
      .join(" ").toLowerCase().includes(lower);
  });
}

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

// Diamond Carats is deliberately not worked out from the size. What goes in a
// bag is weighed, and the weighed figure is the one the register exists to
// account for — a computed one would look like a measurement and quietly become
// the thing everything else is checked against.
export function totalPriceFor(ctsUsed: string, price: string): string {
  const c = num(ctsUsed);
  const p = num(price);
  if (c === null || p === null) return "";
  return round(c * p, 2);
}

// What should come back: everything issued that was not studded. The register
// still stores what was actually counted — this is the figure to check it
// against, not a replacement for the count.
//
// Which means it has to keep up. Filled once and left, it goes stale the moment
// a stone count is corrected, and the row then reads as short by exactly the
// correction — an error made by the form, blamed on the person using it.
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
//
// Only once a return has actually been recorded, though. Before that the row is
// half-filled, not wrong: the expected return is written in for the accountant
// to check against, and measuring a row against a figure this file supplied
// would be marking our own arithmetic. The return date is the deliberate act
// that says the stones are back and the numbers are now the accountant's.
export function shortfall(row: JangadRow): { cts: string; pcs: string } | null {
  if (!row.returnDate.trim()) return null;

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
// --- A stage is finished when it is dated ------------------------------------
// Each block of the workbook carries its own date, and that date is the whole
// point of the block: diamonds went out on a day, jewellery came back on a day,
// loose stones were returned on a day. Figures without one cannot be audited,
// reconciled, or put in order, so a stage with figures and no date is not a
// finished stage — it is an unfinished one, and nothing downstream may treat it
// as done.
export const STAGE_DATE: Record<JangadStage, JangadField> = {
  issue: "date",
  received: "receivedDate",
  returned: "returnDate",
};

// What counts as having started a stage. The date itself is left out — a date
// on its own is someone part-way through, not a stage lacking figures.
const STAGE_FIGURES: Record<JangadStage, JangadField[]> = {
  issue: ["designNo", "subDesignNo", "product", "shape", "size", "pcs", "carats", "memoNo"],
  received: ["ctsUsed", "pcsUsed", "totalPrice"],
  // The two return figures are deliberately absent — see stageStarted.
  returned: ["stockCode", "sellGivenDate", "sellGivenStatus"],
};

// "Difference Cts Return" is what its name says: the difference between what
// went out and what came back studded. It is worked out, not counted, so it is
// filled in as soon as the used figures are known.
//
// Which means a figure matching that sum tells us nothing happened yet. A
// figure someone has changed does: it says stones were physically counted and
// came up short, and a count is an event with a day attached.
export function overriddenReturn(row: JangadRow): boolean {
  const cts = row.ctsReturn.trim();
  const pcs = row.pcsReturn.trim();
  return (
    (!!cts && cts !== expectedCtsReturn(row)) ||
    (!!pcs && pcs !== expectedPcsReturn(row))
  );
}

export function stageStarted(row: JangadRow, stage: JangadStage): boolean {
  if (stage === "returned" && overriddenReturn(row)) return true;
  return STAGE_FIGURES[stage].some((k) => row[k].trim());
}

export function stageDated(row: JangadRow, stage: JangadStage): boolean {
  return !!row[STAGE_DATE[stage]].trim();
}

// Stages that have been filled in but not dated — the rows that cannot go on.
export function missingStageDates(row: JangadRow): JangadStage[] {
  return (["issue", "received", "returned"] as JangadStage[]).filter(
    (st) => stageStarted(row, st) && !stageDated(row, st)
  );
}

// How far a row has actually got. Dated stages only: a half-entered one is not
// somewhere the row has reached.
export function stageOf(row: JangadRow): JangadStage {
  if (stageDated(row, "returned")) return "returned";
  if (stageDated(row, "received")) return "received";
  return "issue";
}

export function suggestedStatus(row: JangadRow): string {
  const stage = stageOf(row);
  if (stage === "returned") return "Returned";
  if (stage === "received") return "Received";
  return "Issued";
}

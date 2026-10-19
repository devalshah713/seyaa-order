// What a stock number audit is, and how it is worded.
//
// Kept apart from stockAudit.ts, which reads the stores and is server-only, so
// the screen and the Excel file can both be built from the same shapes and the
// same sentences. One wording, written once: the block on screen, the printed
// sheet and the downloaded file say the same thing about the same piece.
//
// The register of the words themselves matters here more than usual. The owner
// is not a programmer and is scanning this for one answer — what the piece is,
// where it is, and whether it has gone out — so every line is plain words, one
// idea per line, and a module with nothing in it says so in a whole sentence
// rather than being left as an empty space to interpret.
import { formatDate, outcomeLabel, type StockOutcome } from "./memoFormat";
import type { MemoStockFinding } from "./memoStore";
import type { StockRow } from "./stockBookConfig";
import type { PricedPiece } from "./priceList";
import type { JangadStockHit } from "./jangadSql";
import type { PdStockHit } from "./pdSql";
import type { QcRow } from "./qcStore";
import type { StockRow as SheetRow } from "./stockSheet";

// How many numbers one run takes.
//
// A run is one query per module whatever the length of the list, so the cap is
// not about the database: it is about the page. Fifty numbers is around fifty
// blocks of findings written into the page the server sends, which is what a
// request's ten thousandths of a second of processor time has to cover. Fifty
// is also comfortably more than anybody pastes in one go — his own list was
// eighteen — and the screen says plainly when more are pasted rather than
// quietly answering some of them.
export const MAX_AUDIT_NOS = 50;

// The sentence a number that appears in no module gets. Written down once,
// because it is the answer the whole report exists to be able to give: a number
// nothing is known about must read as an answer and never as an empty section
// somebody has to interpret.
export const NOTHING_ANYWHERE = "Nothing anywhere under this number";

export type AuditModuleKey = "book" | "memos" | "jangad" | "qc" | "pd" | "sheet";

export type AuditModuleState = {
  key: AuditModuleKey;
  label: string;
  ok: boolean;
  error: string;
};

export type AuditBlock = {
  // The number as he wrote it, and the number as everything is compared by.
  asked: string;
  key: string;

  book: { row: StockRow; price: PricedPiece } | null;
  memos: MemoStockFinding[];
  jangad: JangadStockHit[];
  qc: QcRow[];
  pd: PdStockHit[];
  sheet: SheetRow | null;

  // Which modules were actually read for this run. Only a module that answered
  // may be called empty: a module that could not be reached has nothing to say
  // either way, and saying "nothing found" for it would be a lie.
  searched: Record<AuditModuleKey, boolean>;

  found: boolean;
  headline: string[];
};

export type StockAuditReport = {
  // How many numbers were pasted, before the cap.
  pasted: number;
  blocks: AuditBlock[];
  // Everything past the cap, handed back rather than dropped.
  skipped: string[];
  modules: AuditModuleState[];
  prices: unknown;
};

// --- The short answer ---------------------------------------------------------

const chain = (row: StockRow): string =>
  [row.category, row.subCategory, row.subSubCategory].filter(Boolean).join(" / ");

// What the piece is, in one line, from whichever module knows best. The stock
// book first because its description is the one written for a person to read.
function whatItIs(b: AuditBlock): string {
  if (b.book) {
    const row = b.book.row;
    const said = row.design || chain(row) || row.goldDetails;
    const number = row.designNo ? `, design number ${row.designNo}` : "";
    return said
      ? `It is ${said}${number}.`
      : `It is in the stock book${number}, with no description written against it.`;
  }
  if (b.pd.length) {
    const pd = b.pd[0];
    const said = pd.product ? `${pd.product}, ` : "";
    return `Not in the stock book. It was given to ${said}piece ${pd.pieceNo} of PD sheet ${pd.pdNo}.`;
  }
  if (b.jangad.length) {
    const row = b.jangad[0];
    const said = row.product || row.designNo;
    return said
      ? `Not in the stock book. The jangad register calls it ${said}.`
      : "Not in the stock book. Only the jangad register has it.";
  }
  if (b.memos.length && b.memos[0].type) {
    return `Not in the stock book. It went out on a memo as ${b.memos[0].type}.`;
  }
  return "Not in the stock book, so there is no description of it here.";
}

// Where it is now. Both places that record a location are asked, because they
// can disagree and which one is wrong is the kind of thing this report is for.
function whereItIs(b: AuditBlock): string[] {
  const lines: string[] = [];
  if (b.book) {
    lines.push(
      b.book.row.location
        ? `The stock book has it in ${b.book.row.location}.`
        : "The stock book has no place written against it."
    );
  }
  if (!b.searched.sheet) {
    lines.push(
      "The Google stock sheet could not be reached, so nothing here is from it."
    );
  } else if (b.sheet) {
    const where = b.sheet.location || "no location";
    lines.push(
      b.sheet.state === "available"
        ? `The Google stock sheet says ${where}, so it can go out on a memo.`
        : `The Google stock sheet says ${where}. ${b.sheet.reason || "It cannot go out on a memo."}`
    );
  } else {
    lines.push(
      "It is not in the Google stock sheet, so a memo cannot be written for it until somebody adds it."
    );
  }
  return lines;
}

// Whether it is still in stock or has gone out, and on which memo.
function standing(b: AuditBlock): string[] {
  if (!b.searched.memos) {
    return [
      "The memo book could not be read, so whether it has gone out is not known.",
    ];
  }
  if (!b.memos.length) return ["It has never gone out on a memo."];

  // Newest first, and the latest memo is where the piece stands — the same
  // reading the ledger gives.
  const last = b.memos[0];
  const lines: string[] = [];
  const to = last.to ? ` to ${last.to}` : "";
  if (last.outcome === null) {
    lines.push(`Still out on memo ${last.memoNo}${to}, since ${formatDate(last.date)}.`);
  } else {
    lines.push(
      `Last out on memo ${last.memoNo}${to} on ${formatDate(last.date)}, and marked ${outcomeLabel(
        last.outcome
      ).toLowerCase()}.`
    );
    if (last.outcome === "returned") lines.push("So it came back and is in stock again.");
  }
  if (b.memos.length > 1) lines.push(`It has been out ${b.memos.length} times in all.`);
  return lines;
}

// The lines that lead a block. He is scanning for these three things, so they
// come first and the detail follows underneath.
export function blockHeadline(b: AuditBlock): string[] {
  if (b.found) return [whatItIs(b), ...whereItIs(b), ...standing(b)];

  // Nothing found, which is only "nothing anywhere" if everywhere was asked.
  // A run where a store would not answer has not finished the question, and
  // saying it had would be the one mistake this report must not make.
  const unread = (Object.keys(b.searched) as AuditModuleKey[]).filter(
    (key) => !b.searched[key]
  );
  if (unread.length) {
    return [
      "Nothing found under this number in what could be read.",
      `${capital(unread.map(moduleNoun).join(", "))} could not be read, so this is not a full answer yet.`,
    ];
  }
  return [NOTHING_ANYWHERE];
}

// --- A module with nothing in it ---------------------------------------------

const MODULE_NOUNS: Record<AuditModuleKey, string> = {
  book: "the stock book",
  memos: "the memo book",
  jangad: "the jangad register",
  qc: "QC",
  pd: "the PD sheets",
  sheet: "the Google stock sheet",
};

// What a section says when it has nothing to show. Never a blank space: either
// the module was read and holds nothing under this number, or it could not be
// read and therefore says nothing either way.
export function nothingIn(b: AuditBlock, key: AuditModuleKey): string {
  if (!b.searched[key]) {
    return `${capital(MODULE_NOUNS[key])} could not be read, so this part of the report is missing.`;
  }
  return `Nothing in ${MODULE_NOUNS[key]} under this number.`;
}

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function moduleNoun(key: AuditModuleKey): string {
  return MODULE_NOUNS[key];
}

// --- One row per stock number per finding, for the file he sorts and filters --

export type AuditSheetRow = {
  asked: string;
  storedNo: string;
  module: string;
  reference: string;
  date: string;
  what: string;
  party: string;
  weight: string;
  pieces: string;
  status: string;
  detail: string;
};

export const AUDIT_SHEET_HEADERS = [
  "Stock No. asked for", "Number as recorded", "Found in", "Reference", "Date",
  "What it is", "Who / where", "Weight", "Pieces", "Standing", "Detail",
];

export const AUDIT_SHEET_WIDTHS = [
  18, 18, 18, 20, 13, 40, 24, 14, 10, 20, 44,
];

const blank: Omit<AuditSheetRow, "asked" | "module"> = {
  storedNo: "", reference: "", date: "", what: "", party: "",
  weight: "", pieces: "", status: "", detail: "",
};

const joined = (...parts: (string | undefined)[]): string =>
  parts.filter((p) => p && p.trim()).join(" · ");

// Every finding as its own row, so the file sorts and filters by number, by
// module and by date. A number nothing is known about still gets a row, and so
// does a module that could not be read: a file whose missing rows have to be
// noticed is worse than no file.
export function auditSheetRows(report: StockAuditReport): AuditSheetRow[] {
  const rows: AuditSheetRow[] = [];

  for (const b of report.blocks) {
    if (!b.found) {
      // The block's own first line, so the file cannot say "nothing anywhere"
      // on a run where a store would not answer.
      rows.push({
        ...blank,
        asked: b.asked,
        module: "Nothing found",
        status: b.headline[0] || NOTHING_ANYWHERE,
        detail: b.headline.slice(1).join(" "),
      });
    }

    if (b.book) {
      const row = b.book.row;
      const price = b.book.price;
      rows.push({
        ...blank,
        asked: b.asked,
        storedNo: row.stockNo,
        module: "Stock book",
        reference: row.id,
        date: row.date,
        what: joined(row.design, chain(row), row.designNo, row.goldDetails),
        party: joined(row.location, row.partyName),
        weight: joined(
          row.grossWt && `gross ${row.grossWt}`,
          row.netWt && `net ${row.netWt}`,
          price.totalWeight ? `diamond ${price.totalWeight.toFixed(3)} ct` : ""
        ),
        pieces: price.totalPcs ? String(price.totalPcs) : "",
        status: `Worth $${Math.round(price.total.usd)} / ₹${Math.round(price.total.inr)} at today's rates`,
        detail: joined(
          ...row.lines.map((l) =>
            [l.shape, l.sieve, l.breakupWt && `${l.breakupWt} ct`, l.pcs && `${l.pcs} pcs`, l.code]
              .filter(Boolean)
              .join(" ")
          ),
          row.comments
        ),
      });
    }

    for (const m of b.memos) {
      rows.push({
        ...blank,
        asked: b.asked,
        storedNo: m.storedNo,
        module: m.kind === "gold" ? "Gold memo" : "Memo",
        reference: m.memoNo,
        date: m.date,
        what: m.type,
        party: m.to,
        status: outcomeLabel(m.outcome),
        detail: joined(
          m.purpose,
          m.event?.replacedBy && `replaced by ${m.event.replacedBy}`,
          m.event?.note,
          m.event?.by && `recorded by ${m.event.by}`
        ),
      });
    }

    for (const j of b.jangad) {
      rows.push({
        ...blank,
        asked: b.asked,
        storedNo: j.stockCode,
        module: "Jangad register",
        reference: j.id,
        date: j.date,
        what: joined(j.designNo, j.subDesignNo && `piece ${j.subDesignNo}`, j.product, j.shape, j.size),
        party: j.mfgName,
        weight: joined(
          j.carats && `out ${j.carats} ct`,
          j.ctsUsed && `used ${j.ctsUsed} ct`,
          j.ctsReturn && `back ${j.ctsReturn} ct`
        ),
        pieces: joined(
          j.pcs && `out ${j.pcs}`,
          j.pcsUsed && `used ${j.pcsUsed}`,
          j.pcsReturn && `back ${j.pcsReturn}`
        ),
        status: j.status,
        detail: joined(
          j.memoNo && `memo ${j.memoNo}`,
          j.receivedDate && `received ${j.receivedDate}`,
          j.returnDate && `returned ${j.returnDate}`
        ),
      });
    }

    for (const q of b.qc) {
      rows.push({
        ...blank,
        asked: b.asked,
        storedNo: q.stockNo,
        module: "QC",
        reference: q.qcNo,
        date: q.date,
        what: joined(q.designNo, q.category, q.design),
        party: q.checkedBy,
        pieces: q.lineCount ? String(q.lineCount) : "",
        status: qcVerdict(q),
        detail: joined(q.failed.join("; "), q.comments),
      });
    }

    for (const p of b.pd) {
      rows.push({
        ...blank,
        asked: b.asked,
        storedNo: p.stockNo,
        module: "PD sheet",
        reference: p.pdNo,
        what: joined(p.sku, p.product),
        detail: `piece ${p.pieceNo}`,
      });
    }

    if (!b.searched.sheet) {
      rows.push({
        ...blank,
        asked: b.asked,
        module: "Google stock sheet",
        status: "Could not be read",
        detail: "The sheet was not reached, so nothing here says whether this number is in it.",
      });
    } else if (b.sheet) {
      rows.push({
        ...blank,
        asked: b.asked,
        storedNo: b.sheet.stockNo,
        module: "Google stock sheet",
        reference: "STOCK tab",
        party: b.sheet.location,
        status: b.sheet.state === "available" ? "Can go out on a memo" : "Cannot go out on a memo",
        detail: b.sheet.reason,
      });
    } else {
      rows.push({
        ...blank,
        asked: b.asked,
        module: "Google stock sheet",
        status: "Not in the sheet",
        detail: "A memo cannot be written for this number until somebody adds it to the sheet.",
      });
    }

    // Every other module that could not be read, so the gap is on the file
    // rather than left to be noticed.
    for (const key of ["book", "memos", "jangad", "qc", "pd"] as AuditModuleKey[]) {
      if (b.searched[key]) continue;
      rows.push({
        ...blank,
        asked: b.asked,
        module: capital(MODULE_NOUNS[key]),
        status: "Could not be read",
        detail: nothingIn(b, key),
      });
    }
  }

  return rows;
}

export function qcVerdict(q: QcRow): string {
  if (q.result === "pass") return "Passed";
  if (q.result === "fail") return "Failed";
  return "Not finished";
}

export { chain as categoryChain };

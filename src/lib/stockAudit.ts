// Everything the portal knows about a stock number, from every module that
// records one.
//
// Why it exists: answering "what happened to this piece" meant opening six
// screens per number — the stock book, the memo history and its ledger, the
// jangad register, the PD sheet it was designed on, QC, and the Google stock
// sheet the memo form reads. Nobody does that for eighteen numbers, so nobody
// answered the question.
//
// --- What this file is, and is not ------------------------------------------
//
// It reads. Nothing here writes, deletes or corrects anything, in any store.
//
// It does not reach past a store to its tables either. Each module was given a
// function that answers "these stock numbers", next to its own siblings and in
// its own style, so each one still decides for itself whether it is reading the
// database or its JSON document. The last three books have not been copied
// across yet, and the audit has to give the same answers on both paths while
// that is true.
//
// --- The cost ---------------------------------------------------------------
//
// A request on Cloudflare's free plan gets ten thousandths of a second of
// processor time and fifty database queries. Eighteen numbers must therefore
// not become eighteen passes over seven modules, and fifty must not either: it
// is one query per module for the whole list, with the numbers bound into an IN
// list, and the modules are asked at the same time. The columns asked for are
// the ones the report shows and no more.
//
// --- One module failing -----------------------------------------------------
//
// Every module is asked inside its own guard, and a module that could not be
// read is recorded as unread rather than as empty. That is the rule in
// CLAUDE.md and it decides the shape of this file: "not there" is an answer and
// anything else is not. A stock sheet that times out must never read as a
// number missing from it, because a number missing from that sheet is exactly
// what stopped a memo being written once.
import "server-only";
import {
  MAX_AUDIT_NOS,
  blockHeadline,
  type AuditBlock,
  type AuditModuleKey,
  type AuditModuleState,
  type StockAuditReport,
} from "./stockAuditFormat";
import { parseStockList, stockKey } from "./memoFormat";
import { memosForStockNos, type MemoStockFinding } from "./memoStore";
import { stockRowsForNos } from "./stockBookStore";
import { jangadForStockNos } from "./jangadStore";
import { qcRowsForStockNos, type QcRow } from "./qcStore";
import { pdPiecesForStockNos } from "./pdStore";
import { sheetRowsForNos, type SheetLookup } from "./stockSheet";
import { loadPrices } from "./priceStore";
import { priceOf, type StockRow } from "./stockBookConfig";
import { SEED_PRICES } from "./priceSeed";
import type { JangadStockHit } from "./jangadSql";
import type { PdStockHit } from "./pdSql";

export { MAX_AUDIT_NOS };
export type { AuditBlock, AuditModuleKey, AuditModuleState, StockAuditReport };

// One module asked, with what to say if it would not answer.
//
// The failure is kept apart from the answer on purpose. A caller handed an
// empty list cannot tell "nothing under this number" from "the store would not
// answer", and the whole report turns on that difference.
async function ask<T>(
  what: string,
  empty: T,
  work: () => Promise<T>
): Promise<{ value: T; error: string }> {
  try {
    return { value: await work(), error: "" };
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    // Logged as well as reported: a module that has stopped answering is worth
    // knowing about even on a run nobody is watching.
    console.error(`The stock audit could not read ${what}: ${why}`);
    return { value: empty, error: why };
  }
}

function group<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const found = out.get(key) || [];
    found.push(row);
    out.set(key, found);
  }
  return out;
}

// The audit itself.
//
// `raw` is the box exactly as it was pasted: stray spaces, blank lines, commas,
// mixed case and all. Anything past the cap is handed back as skipped rather
// than quietly dropped.
export async function auditStockNos(raw: string): Promise<StockAuditReport> {
  const pasted = parseStockList(raw);
  const asked = pasted.slice(0, MAX_AUDIT_NOS);
  const skipped = pasted.slice(MAX_AUDIT_NOS).map((a) => a.asked);
  const keys = asked.map((a) => a.key);

  // Six modules and the price list, together. Each is one question about the
  // whole list, so this is one round of queries rather than one per number.
  const [book, memos, jangad, qc, pd, sheet, prices] = await Promise.all([
    ask<StockRow[]>("the stock book", [], () => stockRowsForNos(keys)),
    ask<Map<string, MemoStockFinding[]>>("the memo book", new Map(), () =>
      memosForStockNos(keys)
    ),
    ask<JangadStockHit[]>("the jangad register", [], () => jangadForStockNos(keys)),
    ask<QcRow[]>("QC", [], () => qcRowsForStockNos(keys)),
    ask<PdStockHit[]>("the PD sheets", [], () => pdPiecesForStockNos(keys)),
    // This one answers rather than throwing, so the reason the sheet could not
    // be read reaches the screen in the sheet's own words.
    ask<SheetLookup>("the Google stock sheet", { reached: false, error: "" }, () =>
      sheetRowsForNos(keys)
    ),
    // The rates are what a piece is worth today. The seed is the company's own
    // workbook, so a price list that cannot be read values the piece from the
    // workbook rather than leaving every figure blank.
    ask("the price list", SEED_PRICES, () => loadPrices()),
  ]);

  const bookByKey = new Map(book.value.map((row) => [stockKey(row.stockNo), row]));
  const jangadByKey = group(jangad.value, (r) => stockKey(r.stockCode));
  const qcByKey = group(qc.value, (r) => stockKey(r.stockNo));
  const pdByKey = group(pd.value, (r) => stockKey(r.stockNo));
  const sheetRows = sheet.value.reached ? sheet.value.rows : null;
  const sheetError = sheet.value.reached ? "" : sheet.value.error || sheet.error;

  const modules: AuditModuleState[] = [
    { key: "book", label: "the stock book", ok: !book.error, error: book.error },
    { key: "memos", label: "the memo book", ok: !memos.error, error: memos.error },
    { key: "jangad", label: "the jangad register", ok: !jangad.error, error: jangad.error },
    { key: "qc", label: "QC", ok: !qc.error, error: qc.error },
    { key: "pd", label: "the PD sheets", ok: !pd.error, error: pd.error },
    { key: "sheet", label: "the Google stock sheet", ok: !!sheetRows, error: sheetError },
  ];

  const searched: Record<AuditModuleKey, boolean> = {
    book: !book.error,
    memos: !memos.error,
    jangad: !jangad.error,
    qc: !qc.error,
    pd: !pd.error,
    sheet: !!sheetRows,
  };

  const blocks: AuditBlock[] = asked.map(({ asked: written, key }) => {
    const row = bookByKey.get(key) || null;
    const block: AuditBlock = {
      asked: written,
      key,
      book: row ? { row, price: priceOf(prices.value, row) } : null,
      memos: memos.value.get(key) || [],
      jangad: jangadByKey.get(key) || [],
      qc: qcByKey.get(key) || [],
      pd: pdByKey.get(key) || [],
      sheet: sheetRows ? sheetRows.get(key) || null : null,
      searched,
      found: false,
      headline: [],
    };
    // Found anywhere at all. A module that could not be read contributes
    // nothing here, so a number that only this run failed to look up reads as
    // unknown rather than as absent — the unread modules are named on screen.
    block.found =
      !!block.book ||
      block.memos.length > 0 ||
      block.jangad.length > 0 ||
      block.qc.length > 0 ||
      block.pd.length > 0 ||
      !!block.sheet;
    block.headline = blockHeadline(block);
    return block;
  });

  return { pasted: pasted.length, blocks, skipped, modules, prices: prices.value };
}

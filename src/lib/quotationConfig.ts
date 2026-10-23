// A quotation: what a piece would cost, worked out before the piece exists.
//
// A customer asks what something would come to. A seller writes down what was
// described, the portal prices it, and out comes a figure to send. This is the
// same sum the stock book does after a piece is made, done before it is made
// instead, so the pricing is the stock book's and not a second one:
// pricePiece() in priceList.ts, reached through priceOf() below.
//
// Two things follow from that and both matter.
//
// Nothing is stamped onto a quotation. The calculated figures are worked out on
// every read, so changing a rate on the price list moves every quotation's
// figures, exactly as it moves every piece in stock. A quotation is a price on
// today's rates, not a price frozen on the day it was typed.
//
// The one figure that is stored is the one a person decided: what he actually
// told the customer. It starts at the calculated figure and can be written
// over, and the difference between the two is the thing worth looking at later,
// so both are kept and both are shown.
//
// Pure on purpose — no store, no session, no "server-only". The form prices a
// piece as it is typed from this file, and the server prices it again from the
// same file on the way out.
import { priceOf, type StockLine } from "./stockBookConfig";
import { DIA_SHAPES, formatShapes } from "./pdConfig";
import { num, type Money, type PriceList, type PricedPiece } from "./priceList";
import { diaCertificationLabel, type DiaCertification } from "./memoFormat";

// A stone size on a quotation, in the shape the stock book keeps one: the
// carats, how many stones, the shape, the sieve or size, and the Product Code
// the rate hangs on.
//
// The one difference is the vocabulary of `shape`. The stock book writes its own
// short codes, RD and OV; a quotation writes the shapes the order form offers,
// Round and Oval, because these shapes become the order's shape field and an
// order only accepts those. Nothing that prices a line reads the shape except
// suggestCode(), which matches the full word in the price list's fancy table.
export type QuotationLine = StockLine;

export const BLANK_QUOTE_LINE: QuotationLine = {
  breakupWt: "", pcs: "", shape: "", sieve: "", code: "",
};

export const QUOTE_SHAPES: readonly string[] = DIA_SHAPES;

export type Quotation = {
  id: string; // URL-safe, e.g. "QT-26-27-001"
  quotationNo: string; // printed, e.g. "QT/26-27/001"
  fy: string;
  seq: number;
  date: string; // yyyy-mm-dd

  // Who asked for the price, in words. Deliberately not a list: the controlled
  // lists hold manufacturers and memo parties, and a customer ringing up to ask
  // what a bracelet would cost is neither.
  customerName: string;

  productName: string; // what is being made, in words
  category: string; // from the category list
  // Free text, as the order form has them: a seller is writing down what the
  // customer said, not filing it.
  subCategory: string;
  subSubCategory: string;

  goldDetails: string; // one of GOLD_DETAILS — the purity in it picks the rate
  // The gold the piece is expected to come out at, in grams. Kept as it was
  // typed, as every weight in this portal is, and it is what the gold and the
  // labour are charged on.
  goldWt: string;
  polkiLabour: boolean; // a polki piece is set differently and costs more

  size: string;
  pcs: number;

  lines: QuotationLine[];

  // Whether the diamonds are certified. Compulsory on the form and at the
  // server, and it carries into the order the quotation becomes. It changes no
  // figure: see DiaCertification in memoFormat.ts.
  //
  // Optional on the type all the same, so a record without an answer reads as
  // not stated rather than breaking a page it is drawn on.
  diaCertification?: DiaCertification;

  notes: string;

  // Optional here, unlike on an order. A customer asking for a price on the
  // phone often has not sent anything yet, and refusing to quote without a
  // picture would push the whole conversation back to WhatsApp, which is what
  // this exists to stop.
  photoPath?: string;
  photoPublicId?: string;

  // What he actually told the customer, per piece. Absent means nothing was
  // written over the calculated figure, and the calculated figure is the quote.
  quotedUsd?: number;
  quotedInr?: number;

  enteredBy: string;

  createdAt: string;
  updatedAt?: string;

  // The order this quotation became. Written once, by the save that creates the
  // order. From then on the order is its own record and nothing is copied back
  // and forth; this is only the way from one to the other.
  orderId?: string;
  orderNo?: string;
};

// What a caller may ask to be saved. The number, the moment and the order link
// are the portal's, not a caller's.
export type NewQuotation = Omit<
  Quotation,
  "id" | "quotationNo" | "fy" | "seq" | "createdAt" | "updatedAt" | "orderId" | "orderNo"
>;

// The only two things that ever change about a saved quotation: the picture,
// which can be added after the price was given, and the order it became.
export type QuotationPatch = Partial<
  Pick<Quotation, "photoPath" | "photoPublicId" | "orderId" | "orderNo">
>;

// What a quotation is worth on today's price list, per piece.
//
// The stock book's own pricing, handed the quotation's fields under the names it
// uses: the expected gold weight is the net weight, because the stones are not
// gold and it is the metal that gold and labour are charged on.
export function priceQuotation(list: PriceList, q: {
  goldWt: string; goldDetails: string; polkiLabour?: boolean; lines: QuotationLine[];
}): PricedPiece {
  return priceOf(list, {
    netWt: q.goldWt,
    goldDetails: q.goldDetails,
    polkiLabour: q.polkiLabour,
    lines: q.lines,
  });
}

// The figure that was quoted, per piece: what was written over the calculated
// one, or the calculated one where nothing was written over it.
export function quotedFigure(
  q: { quotedUsd?: number; quotedInr?: number },
  priced: PricedPiece
): Money {
  const usd = num(q.quotedUsd ?? null);
  const inr = num(q.quotedInr ?? null);
  return {
    usd: usd === null ? priced.total.usd : usd,
    inr: inr === null ? priced.total.inr : inr,
  };
}

// A quotation as its list row: the quotation itself, what it works out to on
// today's price list, what was quoted, and whether those two are different
// numbers.
//
// Priced on the server, unlike the stock book's rows. The list wants two
// figures per quotation and nothing else, so sending the figures costs less
// than sending the whole price list would, and a seller who may write orders
// cannot read the price list over the API in any case.
export type QuotationRow = {
  quotation: Quotation;
  calculated: Money; // per piece, on today's rates
  quoted: Money; // per piece, as it was given
  differs: boolean;
};

export function quotationRow(list: PriceList, q: Quotation): QuotationRow {
  const priced = priceQuotation(list, q);
  return {
    quotation: q,
    calculated: priced.total,
    quoted: quotedFigure(q, priced),
    differs: quoteDiffers(q, priced),
  };
}

// Is the quoted figure a different number from the calculated one? Asked so the
// screen can say so plainly rather than showing two figures and leaving
// somebody to compare them.
export function quoteDiffers(
  q: { quotedUsd?: number; quotedInr?: number },
  priced: PricedPiece
): boolean {
  const quoted = quotedFigure(q, priced);
  // To the rupee and the dollar, which is what is shown. A difference nobody
  // can see on screen is not a difference worth announcing.
  return (
    Math.round(quoted.usd) !== Math.round(priced.total.usd) ||
    Math.round(quoted.inr) !== Math.round(priced.total.inr)
  );
}

// The shapes a quotation names, as the order form writes them. Kept in the
// order DIA_SHAPES is written in, so the same two shapes always read the same
// way round, which is what parseShapes() does to an order's own line.
export function quoteShapes(lines: QuotationLine[]): string[] {
  const named = lines.map((l) => (l.shape || "").trim().toLowerCase()).filter(Boolean);
  return DIA_SHAPES.filter((shape) => named.includes(shape.toLowerCase()));
}

export function quoteShapeLine(lines: QuotationLine[]): string {
  return formatShapes(quoteShapes(lines));
}

// A line is worth keeping if anything at all was put in it — the same reading
// the stock book gives one.
export function hasQuoteContent(l: QuotationLine): boolean {
  return !!(
    l.breakupWt.trim() || l.pcs.trim() || l.shape.trim() || l.sieve.trim() || l.code.trim()
  );
}

// The carats over every size, and the stones over every size. Taken off the
// lines rather than asked for twice.
export function quoteCarats(lines: QuotationLine[]): number {
  return lines.reduce((n, l) => n + (num(l.breakupWt) ?? 0), 0);
}

export function quoteStones(lines: QuotationLine[]): number {
  return lines.reduce((n, l) => n + (num(l.pcs) ?? 0), 0);
}

// The sieve or stone size a quotation names, which is the first one written.
// One box on an order, however many sizes a quotation has.
export function quoteSieve(lines: QuotationLine[]): string {
  for (const l of lines) {
    const sieve = (l.sieve || "").trim();
    if (sieve) return sieve;
  }
  return "";
}

// The price list has no platinum and no silver rate, and karatOf() reads
// anything that is not 18K as 14K, so a platinum quotation is worked out at the
// 14KT gold rate. That is the honest arithmetic available, and it is worth
// saying out loud on the screen rather than letting a figure stand unexplained.
export function ratelessMetal(goldDetails: string): string {
  const raw = (goldDetails || "").trim().toUpperCase();
  return raw === "PLATINUM" || raw === "SILVER" ? raw : "";
}

// What the box above the list searches.
export type QuotationSearchable = Pick<
  Quotation,
  | "quotationNo" | "customerName" | "productName" | "category" | "subCategory"
  | "subSubCategory" | "goldDetails" | "size" | "notes" | "enteredBy" | "lines"
  | "diaCertification"
> & { orderNo?: string };

export function searchQuotations<T extends QuotationSearchable>(
  rows: T[],
  needle: string
): T[] {
  const phrase = (needle || "").trim().toLowerCase();
  if (!phrase) return rows;
  return rows.filter((q) =>
    [
      q.quotationNo, q.customerName, q.productName, q.category, q.subCategory,
      q.subSubCategory, q.goldDetails, q.size, q.notes, q.enteredBy,
      q.orderNo || "", diaCertificationLabel(q.diaCertification),
      ...(q.lines || []).map((l) => `${l.shape} ${l.sieve} ${l.code}`),
    ]
      .join(" ")
      .toLowerCase()
      .includes(phrase)
  );
}

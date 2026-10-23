// A quotation: what a piece would cost, worked out before the piece exists.
//
// One quotation, two hands. A seller wants to know what a piece would cost, so
// he raises the quotation and writes down what he has in hand: the piece, the
// picture, and his own figures — how many grams of gold, how many carats of
// diamond. That is exactly what he sends on WhatsApp today, which is the thing
// this replaces.
//
// It then goes to the owner for approval. The owner reads the seller's figures,
// corrects the ones that are wrong, and puts the price on it. Saving that is
// the approval; there is no second button. The quotation goes back to the
// seller's screen with the price on it, and that is the quotation he gives the
// customer.
//
// So the owner's own are two things and no more: the approval, and the price.
// Every figure that describes the piece is the seller's to send, and none of
// them is compulsory — they are his best figures, not measurements, and a form
// that refuses him until he knows the sieve of every stone sends him straight
// back to WhatsApp.
//
// The sum itself is the stock book's and not a second one: pricePiece() in
// priceList.ts, reached through priceOf() below. This is the same sum the stock
// book does after a piece is made, done before it is made instead.
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

// One pricing, recorded. A customer argues about a price, so the owner must be
// able to come back and price the same quotation again, and every time he does
// is kept rather than overwritten — the way an order's notes are kept.
//
// Only who and when. What he decided is on the quotation itself, which is what
// the screen reads; this is the trail of hands and moments behind it.
export type QuotationPricing = {
  id: string;
  at: string; // ISO
  by: string; // username
};

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

  size: string;
  pcs: number;

  // --- The figures describing the piece ------------------------------------
  //
  // The seller sends these when he raises the quotation, and the owner corrects
  // them in place when he approves it. Current here means current: what the
  // price is worked out on. What the seller first sent is in sellerFigures
  // below and is never written over.

  // The gold the piece is expected to come out at, in grams. Kept as it was
  // typed, as every weight in this portal is, and it is what the gold and the
  // labour are charged on.
  goldWt: string;

  // Which of the two labour rates the piece is charged at. The owner's alone:
  // it is not a figure describing the piece but a choice of rate, and a rate is
  // part of the price.
  polkiLabour: boolean;

  lines: QuotationLine[];

  // What the seller sent, kept as he sent it.
  //
  // The owner corrects a wrong weight or a wrong sieve on the record itself,
  // because retyping the quotation is the thing this exists to stop. But the
  // difference between what a seller estimated and what the piece really takes
  // is worth seeing, so his own figures are written once, when the quotation is
  // raised, and nothing afterwards touches them — QuotationPatch cannot name
  // this field, so no route can.
  //
  // Optional, so a record from either earlier version reads as a quotation
  // whose seller sent no figures of his own, which is the truth about it.
  sellerFigures?: { goldWt: string; lines: QuotationLine[] };

  // Every approval and re-pricing, who and when, oldest first.
  //
  // It is also what says which of the two states a quotation is in, and the
  // reading is in isQuotationPriced(): the field missing altogether means the
  // record was written when one form asked one person for everything, and such
  // a record has its weight, its lines and its price already.
  pricings?: QuotationPricing[];

  // Whether the diamonds are certified. Compulsory on the form and at the
  // server, and it carries into the order the quotation becomes. It changes no
  // figure: see DiaCertification in memoFormat.ts.
  //
  // Optional on the type all the same, so a record without an answer reads as
  // not stated rather than breaking a page it is drawn on.
  diaCertification?: DiaCertification;

  notes: string;

  // Optional here, unlike on an order. The seller usually has the picture in
  // hand, but refusing him the form until he does would push him back to
  // WhatsApp, which is what this exists to stop.
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

// What can change about a saved quotation: the picture, which can be added
// after it was written; the order it became; and the owner's pricing, which is
// a second sitting on the same record and can be done again when a customer
// argues about the price.
export type QuotationPatch = Partial<
  Pick<
    Quotation,
    | "photoPath" | "photoPublicId" | "orderId" | "orderNo"
    | "goldWt" | "polkiLabour" | "lines" | "quotedUsd" | "quotedInr" | "pricings"
  >
>;

// Has the owner approved and priced it?
//
// Two states and no third one, so this is the only place the question is
// answered and every screen and every route asks it here.
//
// A record with no `pricings` field at all was written before approval became
// the owner's own step, when one form asked one person for everything. It has
// its gold weight, its stone lines and its price already, so it reads as
// priced. A quotation raised by a seller carries an empty list, which is the
// honest "nobody has approved this yet".
export function isQuotationPriced(q: Pick<Quotation, "pricings">): boolean {
  return !Array.isArray(q.pricings) || q.pricings.length > 0;
}

// The state in the words the person looking at it would use.
//
// One quotation sitting in one place reads two ways, because the two people
// waiting on it are waiting for different things. The seller's screen says it
// is with the owner; the owner's says it is his to do. Saying "waiting for a
// price" to the man who has to give the price names the queue and not the job.
//
// `forOwner` left off gives the state in nobody's particular words, which is
// what a caller that does not know who is reading should say.
export function quotationStateLabel(
  q: Pick<Quotation, "pricings">,
  forOwner?: boolean
): string {
  if (isQuotationPriced(q)) return "Priced";
  if (forOwner === undefined) return "Waiting for a price";
  return forOwner ? "Waiting for your approval" : "With the owner for approval";
}

// Did the owner change a figure the seller sent?
//
// Asked so the screen can show what the seller sent beside what the record now
// says, and only when the two are different things. Where they agree the record
// is what he sent and a second copy of it would be noise.
//
// A quotation with no sellerFigures — either earlier version's, or one raised
// with every figure left blank — has nothing to compare, so nothing differs.
export function sellerFiguresDiffer(
  q: Pick<Quotation, "goldWt" | "lines" | "sellerFigures">
): boolean {
  const sent = q.sellerFigures;
  if (!sent) return false;
  if ((sent.goldWt || "").trim() !== (q.goldWt || "").trim()) return true;
  const now = q.lines || [];
  const then = sent.lines || [];
  if (now.length !== then.length) return true;
  return now.some((l, i) => !sameQuoteLine(l, then[i]));
}

function sameQuoteLine(a: QuotationLine, b: QuotationLine): boolean {
  const keys: (keyof QuotationLine)[] = ["breakupWt", "pcs", "shape", "sieve", "code"];
  return keys.every((k) => (a[k] || "").trim() === (b[k] || "").trim());
}

// Did the seller send any figure at all? A quotation he sent with the diamond
// boxes empty is allowed, and the screen says so rather than showing an empty
// panel headed "what the seller sent".
export function sellerSentFigures(
  q: Pick<Quotation, "sellerFigures">
): boolean {
  const sent = q.sellerFigures;
  if (!sent) return false;
  return !!(sent.goldWt || "").trim() || (sent.lines || []).some(hasQuoteContent);
}

// The last hand to price it, for the line that says who and when.
export function lastPricing(
  q: Pick<Quotation, "pricings">
): QuotationPricing | null {
  const all = q.pricings || [];
  return all.length > 0 ? all[all.length - 1] : null;
}

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

// The quoted figure as it is shown, and the same figure for a whole quantity.
//
// Rounded to the dollar and the rupee before it is multiplied, on purpose. A
// customer reads "$2,689 per piece" and doubles it himself; a total worked out
// from the unrounded figure behind that comes to $5,377 against his $5,378, and
// then he is asking which of the two is right. The arithmetic on the page has
// to be arithmetic the person reading it can do.
export function perPiece(price: Money): Money {
  return { usd: Math.round(price.usd), inr: Math.round(price.inr) };
}

export function forPieces(price: Money, pcs: number): Money {
  const per = perPiece(price);
  const n = pcs > 0 ? pcs : 1;
  return { usd: per.usd * n, inr: per.inr * n };
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

// The stone lines as they arrive off a form, cleaned.
//
// One reader for both forms, because both now send them: the seller when he
// raises the quotation, the owner when he corrects it. Two readers would be two
// chances for the two forms to disagree about what a line is.
//
// Every box is text, as the stock book keeps them. A line with nothing at all
// in it is dropped rather than stored empty, and a shape the order form would
// not accept is dropped from the line, so a quotation can never name a shape
// the order it becomes would be refused for.
export function readQuoteLines(v: unknown): QuotationLine[] {
  if (!Array.isArray(v)) return [];
  const str = (raw: unknown, max: number): string =>
    typeof raw === "string" ? raw.trim().slice(0, max) : "";
  return v
    .slice(0, 40)
    .map((raw): QuotationLine => {
      const l = (raw || {}) as Record<string, unknown>;
      const shape = str(l.shape, 40);
      return {
        ...BLANK_QUOTE_LINE,
        breakupWt: str(l.breakupWt, 20),
        pcs: str(l.pcs, 10),
        shape: QUOTE_SHAPES.find((s) => s.toLowerCase() === shape.toLowerCase()) || "",
        sieve: str(l.sieve, 40),
        code: str(l.code, 40),
      };
    })
    .filter(hasQuoteContent);
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

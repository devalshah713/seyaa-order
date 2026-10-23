// The words of a quotation: the block of text the seller copies to the
// customer.
//
// Nothing here sends anything anywhere, exactly as the order message and the
// receipt chase do not. The text is written out, shown with a Copy text button,
// and what happens next is a person pasting it into WhatsApp. That hand-off is
// the part that works, so it is the part that is kept.
//
// Written for a customer reading it on a phone: short lines, one fact a line,
// the words the office already uses. A line with nothing in it is left out
// rather than printed as an empty label.
//
// What it deliberately does not carry is the breakdown. The diamonds, the gold
// and the labour are what the piece costs to make, and the customer is being
// told a price, not shown a cost sheet. The only figure here is the one that
// was quoted.
//
// Pure on purpose — no store, no session, no "server-only". It is handed a
// quotation and a figure and gives back a string, so it can be exercised on its
// own and so the screen has no say in the wording.
import { money, type Money } from "./priceList";
import { diaCertificationLabel } from "./memoFormat";
import {
  forPieces, perPiece, quoteCarats, quoteShapeLine, type Quotation,
} from "./quotationConfig";

export type QuotationMessageInput = Pick<
  Quotation,
  | "quotationNo" | "productName" | "category" | "subCategory" | "subSubCategory"
  | "goldDetails" | "goldWt" | "size" | "pcs" | "lines" | "diaCertification"
>;

const clean = (v: string | undefined): string => (v || "").trim();

// The three category levels as one line, in the order they narrow.
function categoryWords(q: QuotationMessageInput): string {
  return [clean(q.category), clean(q.subCategory), clean(q.subSubCategory)]
    .filter(Boolean)
    .join(" / ");
}

// Which stones and how many carats, as one fact about the piece.
function diamondWords(q: QuotationMessageInput): string {
  const cts = quoteCarats(q.lines || []);
  return [
    clean(quoteShapeLine(q.lines || [])),
    cts > 0 ? `${cts.toFixed(2)} cts` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

// Dollars and rupees on one line, kept plainly apart by their own symbols.
function bothWays(price: Money): string {
  return `$${money(price.usd)} / ₹${money(price.inr)}`;
}

// `price` is the figure that was quoted — what he told the customer, which is
// the calculated figure unless it was written over. Worked out by the caller so
// this file never has to know a price list exists.
export function buildQuotationMessage(q: QuotationMessageInput, price: Money): string {
  const pcs = q.pcs && q.pcs > 0 ? q.pcs : 0;
  const gold = clean(q.goldDetails);
  const goldWt = clean(q.goldWt);
  // The purity and what it is expected to weigh are one fact about the metal.
  const goldWords = [gold, goldWt ? `about ${goldWt} g` : ""].filter(Boolean).join(", ");
  const certified = q.diaCertification ? diaCertificationLabel(q.diaCertification) : "";

  const lines: (string | false)[] = [
    `Quotation ${clean(q.quotationNo)}`.trim(),
    clean(q.productName),
    !!categoryWords(q) && `Category: ${categoryWords(q)}`,
    !!goldWords && `Gold: ${goldWords}`,
    !!clean(q.size) && `Size: ${clean(q.size)}`,
    !!pcs && `Quantity: ${pcs} ${pcs === 1 ? "pc" : "pcs"}`,
    !!diamondWords(q) && `Diamond: ${diamondWords(q)}`,
    !!certified && `Certification: ${certified}`,
    `Price per piece: ${bothWays(perPiece(price))}`,
    // Only when there is more than one, because "for 1 pc" is the line above
    // said twice. Worked out from the rounded figure, so the two lines are
    // arithmetic the customer can check.
    pcs > 1 && `For ${pcs} pcs: ${bothWays(forPieces(price, pcs))}`,
  ];
  return lines.filter((l): l is string => !!l).join("\n");
}

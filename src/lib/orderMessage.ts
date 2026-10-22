// The words of an approved order: the block of text the owner copies into
// WhatsApp by hand.
//
// Nothing here sends anything anywhere, exactly as the receipt chase does not.
// The text is written out, shown on the order's own page with a Copy text
// button, and what happens next is a person pasting it to a manufacturer or to
// the bagging group. That hand-off is the part that works, so it is the part
// that is kept.
//
// Written for somebody reading it on a phone with no portal open: short lines,
// one fact a line, the words the office already uses. A line with nothing in it
// is left out rather than printed as an empty label, because an order that has
// not been given a design number yet must not go out saying "Design number:".
//
// Pure on purpose — no store, no session, no "server-only". It is handed an
// order and gives back a string, so it can be exercised on its own and so the
// screen has no say in the wording.
import type { Order } from "./memoStore";

// What a line needs to carry. Everything is optional because an order saved
// before the seller's form existed has almost none of it.
export type OrderMessageInput = Pick<
  Order,
  | "orderNo" | "productName" | "category" | "subCategory" | "subSubCategory"
  | "goldColor" | "size" | "pcs" | "diaShape" | "diamondCts" | "sieveSize"
  | "stonePcs" | "instructions" | "designNo" | "mfg"
>;

const clean = (v: string | undefined): string => (v || "").trim();

// The three category levels as one line, in the order they narrow.
function categoryWords(o: OrderMessageInput): string {
  return [clean(o.category), clean(o.subCategory), clean(o.subSubCategory)]
    .filter(Boolean)
    .join(" / ");
}

// Shapes and the approximate weight belong together: a manufacturer reads
// "which stones, how many carats" as one fact about the piece.
function diamondWords(o: OrderMessageInput): string {
  const shapes = clean(o.diaShape);
  const cts = o.diamondCts && o.diamondCts > 0 ? `about ${o.diamondCts.toFixed(2)} cts` : "";
  return [shapes, cts].filter(Boolean).join(", ");
}

export function buildOrderMessage(o: OrderMessageInput): string {
  const pcs = o.pcs && o.pcs > 0 ? o.pcs : 0;
  const lines: (string | false)[] = [
    `New order ${clean(o.orderNo)}`.trim(),
    clean(o.productName),
    !!categoryWords(o) && `Category: ${categoryWords(o)}`,
    !!clean(o.goldColor) && `Gold: ${clean(o.goldColor)}`,
    !!clean(o.size) && `Size: ${clean(o.size)}`,
    !!pcs && `Quantity: ${pcs} ${pcs === 1 ? "pc" : "pcs"}`,
    !!diamondWords(o) && `Diamond: ${diamondWords(o)}`,
    !!clean(o.sieveSize) && `Sieve or stone size: ${clean(o.sieveSize)}`,
    !!(o.stonePcs && o.stonePcs > 0) && `Stones: ${o.stonePcs} pcs`,
    !!clean(o.designNo) && `Design number: ${clean(o.designNo)}`,
    !!clean(o.mfg) && `Making: ${clean(o.mfg)}`,
    !!clean(o.instructions) && `Please note: ${clean(o.instructions)}`,
  ];
  return lines.filter((l): l is string => !!l).join("\n");
}

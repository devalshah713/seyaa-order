// An accepted quotation, as the boxes of a new order.
//
// The customer said yes, so the quotation becomes an order and nobody retypes
// it. What comes back here is the order form's own body, field for field, which
// the order route then validates exactly as it validates a seller's. That is
// the point: the order is written down the same path a seller's order takes, so
// it gets its order number, its stamp and its place in the approval chain in
// the same way and by the same code. Nothing here numbers anything, approves
// anything or saves anything.
//
// Three things a quotation can be short of, because the quotation form does not
// insist on them and the order form does:
//
//   * the owner's approval and price, without which there is nothing to carry:
//     the seller's figures are his best guess until the owner has checked them,
//     and there is no price at all;
//   * the reference picture, which is optional on a quotation on purpose — the
//     seller may not have one in hand yet;
//   * a diamond line with a shape and a weight on it, for a plain gold piece.
//
// All three are refused here with a sentence that names the quotation, rather
// than being left to come back from the order route in the order form's words,
// which would send somebody looking for ticks that are not on the screen in
// front of them.
//
// Pure on purpose — no store, no session, no "server-only". It is handed a
// quotation and gives back the body, so it can be exercised on its own.
import { formatShapes } from "./pdConfig";
import {
  isQuotationPriced, quoteCarats, quoteShapes, quoteSieve, quoteStones,
  type Quotation,
} from "./quotationConfig";

// The order form's body, as the form itself sends it. Strings, because that is
// what a form holds and what the order route reads.
export type OrderFromQuotation = {
  customer: string;
  productName: string;
  category: string;
  subCategory: string;
  subSubCategory: string;
  goldColor: string;
  size: string;
  pcs: string;
  diaShape: string;
  diamondCts: string;
  sieveSize: string;
  stonePcs: string;
  diaCertification: string;
  instructions: string;
  photoPath: string;
  photoPublicId: string;
};

export function orderFromQuotation(
  q: Quotation
): { ok: true; body: OrderFromQuotation } | { ok: false; error: string } {
  const lines = q.lines || [];
  const shapes = quoteShapes(lines);
  const carats = quoteCarats(lines);
  const stones = quoteStones(lines);

  // Asked first, because it is the reason the other two would be empty.
  if (!isQuotationPriced(q)) {
    return {
      ok: false,
      error:
        `Quotation ${q.quotationNo} has not been priced yet, so there is ` +
        "nothing to carry onto an order. The owner approves it and puts the " +
        "price on it on the quotation's own page, and then this button will " +
        "work.",
    };
  }

  if (!(q.photoPath || "").trim()) {
    return {
      ok: false,
      error:
        `Quotation ${q.quotationNo} has no reference picture, and an order ` +
        "cannot be saved without one. Add the picture to this quotation, then " +
        "press the button again.",
    };
  }
  if (shapes.length === 0) {
    return {
      ok: false,
      error:
        `Quotation ${q.quotationNo} names no diamond shape, and an order ` +
        "cannot be saved without one. This one has to be written on the order " +
        "form.",
    };
  }
  if (!(carats > 0)) {
    return {
      ok: false,
      error:
        `Quotation ${q.quotationNo} has no diamond weight on it, and an order ` +
        "cannot be saved without one. This one has to be written on the order " +
        "form.",
    };
  }

  return {
    ok: true,
    body: {
      // Who asked for the price becomes the order's party. Free text on both,
      // so nothing is invented by carrying it.
      customer: (q.customerName || "").trim(),
      productName: (q.productName || "").trim(),
      category: (q.category || "").trim(),
      subCategory: (q.subCategory || "").trim(),
      subSubCategory: (q.subSubCategory || "").trim(),
      // One box on both, under two names: the order calls the purity and the
      // colour together its gold colour.
      goldColor: (q.goldDetails || "").trim(),
      size: (q.size || "").trim(),
      pcs: q.pcs && q.pcs > 0 ? String(q.pcs) : "",
      // However many stone sizes the quotation has, the order keeps one line of
      // shapes, which is what it has always kept.
      diaShape: formatShapes(shapes),
      diamondCts: String(carats),
      // One box on an order, so it is the first sieve written.
      sieveSize: quoteSieve(lines),
      stonePcs: stones > 0 ? String(stones) : "",
      // Carried rather than asked again: a design is certified or it is not,
      // and the quotation already settled which.
      diaCertification: q.diaCertification || "",
      instructions: (q.notes || "").trim(),
      photoPath: (q.photoPath || "").trim(),
      photoPublicId: (q.photoPublicId || "").trim(),
    },
  };
}

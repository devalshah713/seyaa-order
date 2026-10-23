import Link from "next/link";
import { isStorageConfigured, peekNextQuotationNo } from "@/lib/memoStore";
import { loadPrices } from "@/lib/priceStore";
import { codeBookOf } from "@/lib/stockBookConfig";
import { todayInput } from "@/lib/memoFormat";
import QuotationForm from "../QuotationForm";

export const metadata = { title: "New Quotation — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

// The price list is read here and the code book is taken off it, and only the
// code book goes to the browser: the sieve names, the shapes and the Product
// Codes, with no rate anywhere in it. So the seller is offered a code for his
// stone sizes exactly as the stock book's own form offers one, and there is no
// price in his page to read back.
//
// The price itself is the owner's, and it is put on afterwards on the
// quotation's own page, which is the one place the whole list is read.
export default async function NewQuotationPage() {
  if (!isStorageConfigured()) {
    return (
      <div className="wrap">
        <div className="page-head"><h1>New Quotation</h1></div>
        <div className="notice">
          Storage isn&rsquo;t configured yet. Set the four <code>R2_*</code>{" "}
          environment variables and redeploy.
        </div>
      </div>
    );
  }

  // A guess, shown so the seller can write the number down as he says it. The
  // save takes its own number, and if somebody saves first the saved quotation
  // is the one that is right.
  const nextNo = await peekNextQuotationNo(todayInput()).catch(() => "");
  const codeBook = codeBookOf(await loadPrices());

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>New Quotation</h1>
        <Link href="/orders/quotations" className="btn">← All quotations</Link>
      </div>
      <QuotationForm
        nextNo={nextNo || "the next number in the book"}
        codeBook={codeBook}
      />
    </div>
  );
}

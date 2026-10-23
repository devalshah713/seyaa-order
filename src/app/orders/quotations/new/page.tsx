import Link from "next/link";
import { isStorageConfigured, peekNextQuotationNo } from "@/lib/memoStore";
import { loadPrices } from "@/lib/priceStore";
import { todayInput } from "@/lib/memoFormat";
import QuotationForm from "../QuotationForm";

export const metadata = { title: "New Quotation — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

// The price list is read here, on the server, and handed to the form.
//
// Not fetched by the browser on purpose: /api/prices belongs to the stock book
// module, and a seller who may write orders but not open the stock book would
// be refused it. The owner's answer was that everybody who can see orders can
// see the money, and reading the store from a page the order module already
// guards is what that comes to.
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

  const prices = await loadPrices();
  // A guess, shown so the seller can write the number down as he says it. The
  // save takes its own number, and if somebody saves first the saved quotation
  // is the one that is right.
  const nextNo = await peekNextQuotationNo(todayInput()).catch(() => "");

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>New Quotation</h1>
        <Link href="/orders/quotations" className="btn">← All quotations</Link>
      </div>
      <QuotationForm prices={prices} nextNo={nextNo || "the next number in the book"} />
    </div>
  );
}

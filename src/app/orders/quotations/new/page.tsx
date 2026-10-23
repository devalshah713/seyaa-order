import Link from "next/link";
import { isStorageConfigured, peekNextQuotationNo } from "@/lib/memoStore";
import { todayInput } from "@/lib/memoFormat";
import QuotationForm from "../QuotationForm";

export const metadata = { title: "New Quotation — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

// No price list here, because there is no figure on this form. A quotation is
// written in two sittings and this is the first one: the seller writes down what
// the customer asked for, and the owner prices it afterwards on the quotation's
// own page, which is where the price list is read.
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

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>New Quotation</h1>
        <Link href="/orders/quotations" className="btn">← All quotations</Link>
      </div>
      <QuotationForm nextNo={nextNo || "the next number in the book"} />
    </div>
  );
}

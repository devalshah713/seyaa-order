import Link from "next/link";
import { listQuotations } from "@/lib/memoStore";
import { loadPrices } from "@/lib/priceStore";
import { quotationRow, type QuotationRow } from "@/lib/quotationConfig";
import QuotationsClient from "./QuotationsClient";

export const metadata = { title: "Quotations — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

export default async function QuotationsPage() {
  let rows: QuotationRow[] = [];
  let error = "";
  try {
    // Priced here rather than in the browser: the list wants two figures per
    // quotation, and the price list belongs to the stock book module so a
    // seller cannot fetch it. See the note on QuotationRow.
    const [quotations, prices] = await Promise.all([listQuotations(), loadPrices()]);
    rows = quotations.map((q) => quotationRow(prices, q));
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load the quotations.";
  }

  const open = rows.filter((r) => !r.quotation.orderId).length;
  const became = rows.length - open;

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Quotations</h1>
        <p>
          {rows.length} total · {open} still open
          {became > 0 && <> · {became} became orders</>}
        </p>
        <Link href="/orders" className="btn">← All orders</Link>
        <Link href="/orders/quotations/new" className="btn btn-primary">New quotation</Link>
      </div>
      {error ? (
        <div className="notice">{error}</div>
      ) : (
        <>
          <p className="hint">
            A quotation is priced on today&rsquo;s price list, every time it is
            opened. Change a rate and every quotation&rsquo;s calculated figure
            moves with it.
            <br />
            The price that was quoted is kept as it was given, and does not move.
          </p>
          <QuotationsClient rows={rows} />
        </>
      )}
    </div>
  );
}

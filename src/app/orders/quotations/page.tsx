import Link from "next/link";
import { listQuotations } from "@/lib/memoStore";
import { loadPrices } from "@/lib/priceStore";
import {
  isQuotationPriced, quotationRow, type QuotationRow,
} from "@/lib/quotationConfig";
import { currentSession } from "@/lib/currentUser";
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

  // Who is reading. The owner's list is a list of work to do; a seller's is a
  // list of what he asked for and whether it has come back priced.
  const session = await currentSession();

  const isAdmin = session?.role === "admin";

  // The count that matters most, said at the top: how many are sitting with the
  // owner, the way the orders page counts the ones waiting for approval.
  const unpriced = rows.filter((r) => !isQuotationPriced(r.quotation)).length;
  const open = rows.filter((r) => !r.quotation.orderId).length;
  const became = rows.length - open;

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Quotations</h1>
        <p>
          {rows.length} total · {open} still open
          {unpriced > 0 && (
            <>
              {" · "}
              {unpriced}
              {isAdmin ? " waiting for your approval" : " with the owner"}
            </>
          )}
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
            A quotation goes two ways. The seller raises it with his own figures
            on it, the owner checks them and puts the price on, and it comes back
            to the seller with the price for his customer.
            <br />
            Once it is priced, the calculated figure is worked out on
            today&rsquo;s price list every time it is opened. The price that was
            quoted is kept as it was given, and does not move.
          </p>
          <QuotationsClient
            rows={rows}
            me={{
              username: session?.username || "",
              isAdmin: session?.role === "admin",
            }}
          />
        </>
      )}
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { getStockEntry, isStockBookConfigured } from "@/lib/stockBookStore";
import { loadPrices } from "@/lib/priceStore";
import StockEntryForm from "../StockEntryForm";

export const metadata = { title: "Stock Entry — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

export default async function EditStockPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  if (!isStockBookConfigured()) {
    return (
      <div className="wrap">
        <div className="page-head"><h1>Stock Entry</h1></div>
        <div className="notice">
          Storage isn&rsquo;t configured yet. Set the four <code>R2_*</code>{" "}
          environment variables and redeploy.
        </div>
      </div>
    );
  }

  const [entry, prices] = await Promise.all([getStockEntry(params.id), loadPrices()]);
  if (!entry) notFound();

  return (
    <div className="wrap jg-wrap">
      <div className="page-head">
        <h1>{entry.stockNo}</h1>
        <Link href="/stockbook" className="btn">Back to the book</Link>
      </div>
      <StockEntryForm prices={prices} pieces={[]} stockNo={entry.stockNo} entry={entry} />
    </div>
  );
}

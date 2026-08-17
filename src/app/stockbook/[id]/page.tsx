import Link from "next/link";
import { notFound } from "next/navigation";
import { getStockEntry, isStockBookConfigured } from "@/lib/stockBookStore";
import { loadPrices } from "@/lib/priceStore";
import StockEntryForm from "../StockEntryForm";

export const metadata = { title: "Stock Entry — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

export default async function EditStockPage({
  params,
}: {
  params: { id: string };
}) {
  if (!isStockBookConfigured()) {
    return (
      <div className="wrap">
        <div className="page-head"><h1>Stock Entry</h1></div>
        <div className="notice">
          Storage isn&rsquo;t configured yet. Add the <code>BLOB_READ_WRITE_TOKEN</code>{" "}
          environment variable in Vercel and redeploy.
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

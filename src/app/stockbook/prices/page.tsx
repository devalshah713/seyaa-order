import Link from "next/link";
import { loadPrices } from "@/lib/priceStore";
import PriceListEditor from "./PriceListEditor";

export const metadata = { title: "Price List — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

export default async function PricesPage() {
  const prices = await loadPrices();
  return (
    <div className="wrap jg-wrap">
      <div className="page-head">
        <h1>Price List</h1>
        <Link href="/stockbook" className="btn">Back to the book</Link>
      </div>
      <p className="jg-blurb">
        Per-carat diamond prices and the gold and labour rates. Everything in the
        stock book is valued at these figures as they stand — changing a rate
        re-prices the whole book.
      </p>
      <PriceListEditor prices={prices} />
    </div>
  );
}

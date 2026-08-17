import Link from "next/link";
import {
  isStockBookConfigured, nextStockNo, piecesForStock, type StockSeedPiece,
} from "@/lib/stockBookStore";
import { loadPrices } from "@/lib/priceStore";
import StockEntryForm from "../StockEntryForm";

export const metadata = { title: "Take into Stock — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

export default async function NewStockPage() {
  if (!isStockBookConfigured()) {
    return (
      <div className="wrap">
        <div className="page-head"><h1>Take into Stock</h1></div>
        <div className="notice">
          Storage isn&rsquo;t configured yet. Add the <code>BLOB_READ_WRITE_TOKEN</code>{" "}
          environment variable in Vercel and redeploy.
        </div>
      </div>
    );
  }

  // A piece that never went through the register can still be entered by hand,
  // so a failure to read the register is not a reason to refuse the page.
  let pieces: StockSeedPiece[] = [];
  try {
    pieces = await piecesForStock();
  } catch {
    pieces = [];
  }
  const [stockNo, prices] = await Promise.all([nextStockNo(), loadPrices()]);

  return (
    <div className="wrap jg-wrap">
      <div className="page-head">
        <h1>Take into Stock</h1>
        <Link href="/stockbook" className="btn">Back to the book</Link>
      </div>
      <StockEntryForm prices={prices} pieces={pieces} stockNo={stockNo} />
    </div>
  );
}

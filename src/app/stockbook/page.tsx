import {
  isStockBookConfigured, listStockPage, type StockBookPage,
} from "@/lib/stockBookStore";
import { loadPrices } from "@/lib/priceStore";
import { SEED_PRICES } from "@/lib/priceSeed";
import type { PriceList } from "@/lib/priceList";
import StockBookClient from "./StockBookClient";

export const metadata = { title: "Stock Book — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

// The filters live in the address bar, not only in the browser's memory. Two
// reasons, the same two as on /jangad: the narrowing is done by the database
// now, so the server has to know what is being asked for; and a refresh, a back
// button or a bookmarked link then keeps the dates and the place somebody had
// set.
export default async function StockBookPage(props: {
  searchParams: Promise<{ q?: string; from?: string; to?: string; location?: string }>;
}) {
  const searchParams = await props.searchParams;
  if (!isStockBookConfigured()) {
    return (
      <div className="wrap">
        <div className="page-head"><h1>Stock Book</h1></div>
        <div className="notice">
          Storage isn&rsquo;t configured yet. Set the four <code>R2_*</code>{" "}
          environment variables and redeploy.
        </div>
      </div>
    );
  }

  const filters = {
    q: searchParams.q || "",
    from: searchParams.from || "",
    to: searchParams.to || "",
    location: searchParams.location || "",
  };

  let page: StockBookPage = {
    rows: [], locations: [], total: 0, cap: 0, more: false, filtered: false,
  };
  // The price list is sent once however many rows there are — 13 KB of rates —
  // and every figure on screen is worked out from it in the browser, so
  // changing the gold rate re-values the book without the page being rebuilt.
  let prices: PriceList = SEED_PRICES;
  let error = "";
  try {
    [page, prices] = await Promise.all([listStockPage(filters), loadPrices()]);
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load the stock book.";
  }

  return (
    <div className="wrap jg-wrap">
      <div className="page-head"><h1>Stock Book</h1></div>
      {error ? (
        <div className="notice">{error}</div>
      ) : (
        <StockBookClient
          rows={page.rows}
          prices={prices}
          locations={page.locations}
          total={page.total}
          cap={page.cap}
          more={page.more}
          filtered={page.filtered}
          initialQuery={filters.q}
          initialFrom={filters.from}
          initialTo={filters.to}
          initialLocation={filters.location}
        />
      )}
    </div>
  );
}

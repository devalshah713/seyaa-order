import { isStockBookConfigured, listStockEntries } from "@/lib/stockBookStore";
import { loadPrices } from "@/lib/priceStore";
import { SEED_PRICES } from "@/lib/priceSeed";
import type { StockEntry } from "@/lib/stockBookConfig";
import type { PriceList } from "@/lib/priceList";
import StockBookClient from "./StockBookClient";

export const metadata = { title: "Stock Book — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

export default async function StockBookPage(props: {
  searchParams: Promise<{ q?: string }>;
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

  let entries: StockEntry[] = [];
  let prices: PriceList = SEED_PRICES;
  let error = "";
  try {
    [entries, prices] = await Promise.all([listStockEntries(), loadPrices()]);
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
          entries={entries}
          prices={prices}
          initialQuery={searchParams.q || ""}
        />
      )}
    </div>
  );
}

import Link from "next/link";
import { listStockEntries } from "@/lib/stockStore";
import { isStorageConfigured } from "@/lib/sheetStore";
import SellPicker, { SellStock } from "./SellPicker";

export const dynamic = "force-dynamic";

export default async function SellPage() {
  if (!isStorageConfigured()) {
    return (
      <main className="container">
        <h1>Sell of Diamonds</h1>
        <div className="card" style={{ marginTop: 16 }}>
          <p className="muted">Once the Google Sheet is connected, stock pieces will appear here to sell.</p>
        </div>
      </main>
    );
  }

  const entries = await listStockEntries();
  const stocks: SellStock[] = entries.map((e) => ({
    stockNo: e.stockNo,
    date: e.date,
    designNumber: e.designNumber,
    designName: e.designName,
    manufacturerName: e.manufacturerName,
    totalDiaPcs: e.totalDiaPcs,
    totalDiamondWeight: e.totalDiamondWeight,
  }));

  return (
    <main className="container">
      <div className="row spread" style={{ marginBottom: 20 }}>
        <div>
          <h1>Sell of Diamonds</h1>
          <p className="muted">
            Select the stock pieces taken in — their diamonds are treated as sold, the rest returned —
            and export the sell sheet for the diamond team.
          </p>
        </div>
        <Link href="/stock" className="btn ghost">← Stock</Link>
      </div>
      <SellPicker stocks={stocks} />
    </main>
  );
}

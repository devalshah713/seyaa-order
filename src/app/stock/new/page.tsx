import Link from "next/link";
import StockInForm from "./StockInForm";
import { getStockEntry } from "@/lib/stockStore";

export const dynamic = "force-dynamic";

export default async function NewStockPage({
  searchParams,
}: {
  searchParams: { design?: string; stock?: string };
}) {
  const stockNo = (searchParams.stock || "").trim();
  const entry = stockNo ? await getStockEntry(stockNo) : null;
  const editing = !!entry;

  if (stockNo && !entry) {
    return (
      <main className="container">
        <div className="card" style={{ marginTop: 16 }}>
          <h1>Stock not found</h1>
          <p className="muted">No stock piece with number “{stockNo}”.</p>
          <Link href="/stock" className="btn ghost">← Back to stock</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <div style={{ marginBottom: 16 }}>
        <Link href="/stock" className="muted">← Stock</Link>
        <h1 style={{ marginTop: 6 }}>
          {editing ? `Edit Stock No. ${entry!.stockNo}` : "Stock In from Manufacturer"}
        </h1>
        <p className="muted">
          {editing
            ? "Update this stock piece's details — changes overwrite the saved entry."
            : "Record a finished piece coming into stock — gold weights, the diamond breakup, and pricing in $ and ₹. Pick a design to auto-fill the maker and the diamonds used."}
        </p>
      </div>
      <StockInForm initialDesign={searchParams.design || ""} initialEntry={entry} />
    </main>
  );
}

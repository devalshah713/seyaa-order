import Link from "next/link";
import StockInForm from "./StockInForm";

export const dynamic = "force-dynamic";

export default function NewStockPage({ searchParams }: { searchParams: { design?: string } }) {
  return (
    <main className="container">
      <div style={{ marginBottom: 16 }}>
        <Link href="/stock" className="muted">← Stock</Link>
        <h1 style={{ marginTop: 6 }}>Stock In from Manufacturer</h1>
        <p className="muted">
          Record a finished piece coming into stock — gold weights, the diamond breakup, and pricing
          in $ and ₹. Pick a design to auto-fill the maker and the diamonds used.
        </p>
      </div>
      <StockInForm initialDesign={searchParams.design || ""} />
    </main>
  );
}

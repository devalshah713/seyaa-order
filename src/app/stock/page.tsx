import Link from "next/link";
import { listStockEntries } from "@/lib/stockStore";
import { isStorageConfigured } from "@/lib/sheetStore";

export const dynamic = "force-dynamic";

export default async function StockPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  if (!isStorageConfigured()) {
    return (
      <main className="container">
        <h1>Stock</h1>
        <div className="card" style={{ marginTop: 16 }}>
          <p className="muted">Once the Google Sheet is connected, stock pieces will appear here.</p>
        </div>
      </main>
    );
  }

  const { q } = searchParams;
  let entries = await listStockEntries();
  if (q) {
    const needle = q.toLowerCase();
    entries = entries.filter(
      (e) =>
        e.stockNo.toLowerCase().includes(needle) ||
        e.designNumber.toLowerCase().includes(needle) ||
        e.designName.toLowerCase().includes(needle) ||
        e.location.toLowerCase().includes(needle) ||
        e.manufacturerName.toLowerCase().includes(needle)
    );
  }

  return (
    <main className="container">
      <div className="row spread" style={{ marginBottom: 20 }}>
        <div>
          <h1>Stock</h1>
          <p className="muted">
            Finished pieces in stock · {entries.length} item{entries.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="row">
          <a href="/api/stock/export" className="btn ghost">Export to Excel</a>
          <Link href="/stock/new" className="btn gold">+ Record Stock In</Link>
        </div>
      </div>

      <form className="filters no-print" method="get">
        <input name="q" placeholder="Search stock #, design, maker, location…" defaultValue={q || ""} />
        <button className="btn ghost small" type="submit">Filter</button>
        <Link href="/stock" className="btn ghost small">Reset</Link>
      </form>

      {entries.length === 0 ? (
        <div className="card empty">
          No stock recorded yet.{" "}
          <Link href="/stock/new" style={{ color: "var(--gold)", fontWeight: 600 }}>Record one →</Link>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Stock #</th>
              <th>Date</th>
              <th>Design #</th>
              <th>Design Name</th>
              <th>Maker</th>
              <th>Location</th>
              <th>Gross</th>
              <th>Net</th>
              <th>Dia Wt</th>
              <th>Dia Pcs</th>
              <th>Total ($)</th>
              <th>Total (₹)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.stockNo}>
                <td style={{ fontWeight: 700 }}>{e.stockNo}</td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{e.date || "—"}</td>
                <td>
                  {e.designNumber ? (
                    <Link href={`/audit?order=${encodeURIComponent(e.designNumber)}`}>{e.designNumber}</Link>
                  ) : "—"}
                </td>
                <td>{e.designName || "—"}</td>
                <td className="muted">{e.manufacturerName || "—"}</td>
                <td className="muted">{e.location || "—"}</td>
                <td>{e.grossWeight || "—"}</td>
                <td>{e.netWeight || "—"}</td>
                <td>{e.totalDiamondWeight || "—"}</td>
                <td className="muted">{e.totalDiaPcs || "—"}</td>
                <td>{e.totalUsd || "—"}</td>
                <td>{e.totalInr || "—"}</td>
                <td>
                  <Link href={`/stock/new?stock=${encodeURIComponent(e.stockNo)}`} className="btn ghost small">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

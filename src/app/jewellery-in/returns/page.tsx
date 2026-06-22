import Link from "next/link";
import { listReturns } from "@/lib/diamondReturnStore";
import { isStorageConfigured } from "@/lib/sheetStore";

export const dynamic = "force-dynamic";

export default async function DiamondReturnLogPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  if (!isStorageConfigured()) {
    return (
      <main className="container">
        <h1>Diamond Return Log</h1>
        <div className="card" style={{ marginTop: 16 }}>
          <p className="muted">Once the Google Sheet is connected, returned diamonds will appear here.</p>
        </div>
      </main>
    );
  }

  const { q } = searchParams;
  let rows = await listReturns();
  rows = [...rows].reverse(); // newest first
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.designNo.toLowerCase().includes(needle) ||
        r.shape.toLowerCase().includes(needle) ||
        r.size.toLowerCase().includes(needle) ||
        r.description.toLowerCase().includes(needle)
    );
  }

  return (
    <main className="container">
      <div className="row spread" style={{ marginBottom: 20 }}>
        <div>
          <h1>Diamond Return Log</h1>
          <p className="muted">
            Clean record of every diamond returned — unused or broken · {rows.length} entr
            {rows.length === 1 ? "y" : "ies"}
          </p>
        </div>
        <div className="row">
          <Link href="/jewellery-in" className="btn ghost">
            ← Jewellery In
          </Link>
          {rows.length > 0 && (
            <a
              href={`/api/jewellery-in/returns/export${q ? `?q=${encodeURIComponent(q)}` : ""}`}
              className="btn gold"
            >
              Export to Excel
            </a>
          )}
        </div>
      </div>

      <form className="filters no-print" method="get">
        <input name="q" placeholder="Search design, shape, size…" defaultValue={q || ""} />
        <button className="btn ghost small" type="submit">
          Filter
        </button>
        <Link href="/jewellery-in/returns" className="btn ghost small">
          Reset
        </Link>
      </form>

      {rows.length === 0 ? (
        <div className="card empty">No diamond returns recorded yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Sr</th>
              <th>Date</th>
              <th>Description</th>
              <th>Shape</th>
              <th>Size</th>
              <th>Carat Wt</th>
              <th>Pcs</th>
              <th>Design</th>
              <th>Comments</th>
              <th>Remark</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="muted">{r.srNo}</td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{r.date || "—"}</td>
                <td>{r.description || "—"}</td>
                <td>{r.shape || "—"}</td>
                <td className="muted">{r.size || "—"}</td>
                <td>{r.caratWeight || "—"}</td>
                <td>{r.pcs || "—"}</td>
                <td>
                  {r.designNo ? (
                    <Link href={`/audit?order=${encodeURIComponent(r.designNo)}`}>{r.designNo}</Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="muted">{r.comments || "—"}</td>
                <td className="muted">{r.remark || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

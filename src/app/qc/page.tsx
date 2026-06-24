import Link from "next/link";
import { listQc } from "@/lib/qcStore";
import { isStorageConfigured } from "@/lib/sheetStore";

export const dynamic = "force-dynamic";

const RESULT_COLOR: Record<string, string> = { PASS: "#16a34a", FAIL: "#dc2626", PENDING: "#d97706" };
const RESULT_LABEL: Record<string, string> = { PASS: "Pass", FAIL: "Fail", PENDING: "Pending" };

export default async function QcPage({ searchParams }: { searchParams: { q?: string } }) {
  if (!isStorageConfigured()) {
    return (
      <main className="container">
        <h1>Quality Check</h1>
        <div className="card" style={{ marginTop: 16 }}>
          <p className="muted">Once the Google Sheet is connected, QC records will appear here.</p>
        </div>
      </main>
    );
  }

  const { q } = searchParams;
  let records = await listQc();
  if (q) {
    const needle = q.toLowerCase();
    records = records.filter(
      (r) =>
        r.stockNo.toLowerCase().includes(needle) ||
        r.designName.toLowerCase().includes(needle) ||
        r.designNumber.toLowerCase().includes(needle) ||
        (RESULT_LABEL[r.result] || r.result).toLowerCase().includes(needle)
    );
  }

  return (
    <main className="container">
      <div className="row spread" style={{ marginBottom: 20 }}>
        <div>
          <h1>Quality Check</h1>
          <p className="muted">QC results per stock piece · {records.length} record{records.length === 1 ? "" : "s"}</p>
        </div>
        <Link href="/qc/new" className="btn gold">+ New QC</Link>
      </div>

      <form className="filters no-print" method="get">
        <input name="q" placeholder="Search stock #, design, result…" defaultValue={q || ""} />
        <button className="btn ghost small" type="submit">Filter</button>
        <Link href="/qc" className="btn ghost small">Reset</Link>
      </form>

      {records.length === 0 ? (
        <div className="card empty">
          No QC records yet.{" "}
          <Link href="/qc/new" style={{ color: "var(--gold)", fontWeight: 600 }}>Run one →</Link>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Stock #</th>
              <th>Design Name</th>
              <th>Design #</th>
              <th>Result</th>
              <th>Checked By</th>
              <th>Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.stockNo}>
                <td style={{ fontWeight: 700 }}>{r.stockNo}</td>
                <td>{r.designName || "—"}</td>
                <td>{r.designNumber || "—"}</td>
                <td>
                  <span className="badge" style={{ background: RESULT_COLOR[r.result] || "#64748b" }}>
                    {RESULT_LABEL[r.result] || r.result || "—"}
                  </span>
                </td>
                <td className="muted">{r.checkedBy || "—"}</td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{r.date || "—"}</td>
                <td>
                  <Link href={`/qc/new?stock=${encodeURIComponent(r.stockNo)}`} className="btn ghost small">Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

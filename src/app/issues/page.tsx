import Link from "next/link";
import { listIssues } from "@/lib/diamondIssueStore";
import { isStorageConfigured } from "@/lib/sheetStore";
import { ISSUE_STATUSES, ISSUE_STATUS_LABELS, ISSUE_STATUS_COLORS } from "@/lib/diamondIssueConfig";

export const dynamic = "force-dynamic";

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string };
}) {
  if (!isStorageConfigured()) {
    return (
      <main className="container">
        <h1>Diamond Issue</h1>
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Google Sheet not connected yet</h2>
          <p className="muted">
            Once the Google Sheet connection is added, diamond issues will appear here.
          </p>
        </div>
      </main>
    );
  }

  const { status, q } = searchParams;
  let issues = await listIssues();

  if (status) issues = issues.filter((i) => i.status === status);
  if (q) {
    const needle = q.toLowerCase();
    issues = issues.filter(
      (i) =>
        i.memoNo.toLowerCase().includes(needle) ||
        i.designNumber.toLowerCase().includes(needle)
    );
  }

  return (
    <main className="container">
      <div className="row spread" style={{ marginBottom: 20 }}>
        <div>
          <h1>Diamond Issue to Manufacturer</h1>
          <p className="muted">
            {issues.length} memo{issues.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="row">
          <Link href="/jewellery-in" className="btn ghost">
            Jewellery In
          </Link>
          <Link href="/issues/export" className="btn ghost">
            Export to Excel
          </Link>
          <Link href="/audit?module=Diamond%20Issue" className="btn ghost">
            Audit Trail
          </Link>
          <Link href="/issues/new" className="btn gold">
            + New Issue
          </Link>
        </div>
      </div>

      <form className="filters no-print" method="get">
        <input name="q" placeholder="Search memo # or design…" defaultValue={q || ""} />
        <select name="status" defaultValue={status || ""}>
          <option value="">All statuses</option>
          {ISSUE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ISSUE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <button className="btn ghost small" type="submit">
          Filter
        </button>
        <Link href="/issues" className="btn ghost small">
          Reset
        </Link>
      </form>

      {issues.length === 0 ? (
        <div className="card empty">
          No diamond issues yet.{" "}
          <Link href="/issues/new" style={{ color: "var(--gold)", fontWeight: 600 }}>
            Create one →
          </Link>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Memo #</th>
              <th>Design</th>
              <th>Factory</th>
              <th>Product</th>
              <th>Bags</th>
              <th>Total Price</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((i) => (
              <tr key={i.memoNo}>
                <td>
                  <Link href={`/issues/view?id=${encodeURIComponent(i.memoNo)}`} style={{ fontWeight: 700 }}>
                    {i.memoNo}
                  </Link>
                </td>
                <td>
                  <Link href={`/issues/view?id=${encodeURIComponent(i.memoNo)}`}>
                    {i.designNumber || "—"}
                    {i.subDesignNo ? ` / ${i.subDesignNo}` : ""}
                  </Link>
                </td>
                <td>{i.factory || "—"}</td>
                <td className="muted">{i.product || "—"}</td>
                <td className="muted">{i.lines.length}</td>
                <td>{i.additionOfTotalPrice || "—"}</td>
                <td>
                  <span className="badge" style={{ background: ISSUE_STATUS_COLORS[i.status] || "#64748b" }}>
                    {ISSUE_STATUS_LABELS[i.status] || i.status}
                  </span>
                </td>
                <td className="muted">{i.date || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

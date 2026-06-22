import Link from "next/link";
import { listIssues } from "@/lib/diamondIssueStore";
import { isStorageConfigured } from "@/lib/sheetStore";
import { ISSUE_STATUS_LABELS, ISSUE_STATUS_COLORS } from "@/lib/diamondIssueConfig";

export const dynamic = "force-dynamic";

// Memos still waiting to be received (Pending / legacy Issued).
const AWAITING = new Set(["PENDING", "ISSUED", "PARTIAL"]);

export default async function JewelleryInPage() {
  if (!isStorageConfigured()) {
    return (
      <main className="container">
        <h1>Jewellery In from Manufacturer</h1>
        <div className="card" style={{ marginTop: 16 }}>
          <p className="muted">Once the Google Sheet is connected, issued memos will appear here to receive.</p>
        </div>
      </main>
    );
  }

  const issues = await listIssues();
  const pending = issues.filter((i) => AWAITING.has(i.status));
  const received = issues.filter((i) => !AWAITING.has(i.status));

  return (
    <main className="container">
      <div className="row spread" style={{ marginBottom: 20 }}>
        <div>
          <h1>Jewellery In from Manufacturer</h1>
          <p className="muted">
            {pending.length} memo{pending.length === 1 ? "" : "s"} awaiting receipt
          </p>
        </div>
        <div className="row">
          <Link href="/jewellery-in/returns" className="btn ghost">
            Diamond Return Log
          </Link>
          <Link href="/jewellery-in/new" className="btn gold">
            + Record Jewellery In
          </Link>
        </div>
      </div>

      <h2>Awaiting receipt</h2>
      {pending.length === 0 ? (
        <div className="card empty">Nothing pending — every issued memo has been received.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Memo #</th>
              <th>Design</th>
              <th>Factory</th>
              <th>Bags</th>
              <th>Status</th>
              <th>Issue Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pending.map((i) => (
              <tr key={i.memoNo}>
                <td style={{ fontWeight: 700 }}>{i.memoNo}</td>
                <td>{i.designNumber || "—"}</td>
                <td>{i.factory || "—"}</td>
                <td className="muted">{i.lines.length}</td>
                <td>
                  <span className="badge" style={{ background: ISSUE_STATUS_COLORS[i.status] || "#64748b" }}>
                    {ISSUE_STATUS_LABELS[i.status] || i.status}
                  </span>
                </td>
                <td className="muted">{i.date || "—"}</td>
                <td>
                  <Link
                    href={`/jewellery-in/new?design=${encodeURIComponent(i.designNumber || "")}`}
                    className="btn gold small"
                  >
                    Receive
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {received.length > 0 && (
        <>
          <h2 style={{ marginTop: 24 }}>Recently received</h2>
          <table>
            <thead>
              <tr>
                <th>Memo #</th>
                <th>Design</th>
                <th>Bags</th>
                <th>Status</th>
                <th>Received</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {received.slice(0, 25).map((i) => (
                <tr key={i.memoNo}>
                  <td style={{ fontWeight: 700 }}>{i.memoNo}</td>
                  <td>{i.designNumber || "—"}</td>
                  <td className="muted">{i.lines.length}</td>
                  <td>
                    <span className="badge" style={{ background: ISSUE_STATUS_COLORS[i.status] || "#64748b" }}>
                      {ISSUE_STATUS_LABELS[i.status] || i.status}
                    </span>
                  </td>
                  <td className="muted">{i.receivedDate || "—"}</td>
                  <td>
                    <Link
                      href={`/jewellery-in/new?design=${encodeURIComponent(i.designNumber || "")}`}
                      className="btn ghost small"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { getIssue } from "@/lib/diamondIssueStore";
import { ISSUE_STATUS_LABELS, ISSUE_STATUS_COLORS } from "@/lib/diamondIssueConfig";
import ReconcileControl from "./ReconcileControl";

export const dynamic = "force-dynamic";

export default async function IssueDetailPage({
  searchParams,
}: {
  searchParams: { id?: string };
}) {
  const memoNo = searchParams.id || "";
  const issue = memoNo ? await getIssue(memoNo) : null;
  if (!issue) notFound();

  return (
    <main className="container">
      <div className="row spread" style={{ marginBottom: 16 }}>
        <div>
          <Link href="/issues" className="muted no-print">
            ← All issues
          </Link>
          <h1 style={{ marginTop: 6 }}>Memo {issue.memoNo}</h1>
        </div>
        <div className="row no-print" style={{ alignItems: "center" }}>
          <Link href={`/audit?order=${encodeURIComponent(issue.memoNo)}`} className="btn ghost">
            Audit Trail
          </Link>
          <span className="badge" style={{ background: ISSUE_STATUS_COLORS[issue.status] || "#64748b" }}>
            {ISSUE_STATUS_LABELS[issue.status] || issue.status}
          </span>
        </div>
      </div>

      <div className="card">
        <div className="grid3">
          <div>
            <div className="muted">Design</div>
            <div style={{ fontWeight: 600 }}>
              {issue.designNumber || "—"}
              {issue.subDesignNo ? ` / ${issue.subDesignNo}` : ""}
            </div>
            <div className="muted" style={{ marginTop: 8 }}>Factory (issued to)</div>
            <div style={{ fontWeight: 600 }}>{issue.factory || "—"}</div>
          </div>
          <div>
            <div className="muted">Product</div>
            <div style={{ fontWeight: 600 }}>{issue.product || "—"}</div>
            <div className="muted" style={{ marginTop: 8 }}>Issue Date</div>
            <div style={{ fontWeight: 600 }}>{issue.date || "—"}</div>
            <div className="muted" style={{ marginTop: 8 }}>Received Date</div>
            <div style={{ fontWeight: 600 }}>{issue.receivedDate || "—"}</div>
          </div>
          <div>
            <div className="muted">Addition of Total Price</div>
            <div style={{ fontWeight: 600 }}>{issue.additionOfTotalPrice || "—"}</div>
            <div className="muted" style={{ marginTop: 8 }}>Average Price (per ct)</div>
            <div style={{ fontWeight: 600 }}>{issue.averagePrice || "—"}</div>
          </div>
        </div>
      </div>

      <h2 style={{ marginTop: 8 }}>Diamond Lines</h2>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Shape</th>
              <th>Setting</th>
              <th>Certi No.</th>
              <th>Size</th>
              <th>Pcs</th>
              <th>Carats</th>
              <th>Cvd/Hpht</th>
              <th>Price</th>
              <th>Cts Used</th>
              <th>Pcs Used</th>
              <th>Difference</th>
              <th>Total Price</th>
            </tr>
          </thead>
          <tbody>
            {issue.lines.map((ln, i) => (
              <tr key={i}>
                <td>{ln.values["Product"] || "—"}</td>
                <td>{ln.values["Diamond Shape"] || "—"}</td>
                <td>{ln.values["SETTING"] || "—"}</td>
                <td>{ln.values["Certi No."] || "—"}</td>
                <td>{ln.values["Diamond Size"] || "—"}</td>
                <td>{ln.values["Diamond Pcs"] || "—"}</td>
                <td>{ln.values["Diamond Carats"] || "—"}</td>
                <td>{ln.values["Cvd/Hpht"] || "—"}</td>
                <td>{ln.values["Price"] || "—"}</td>
                <td>{ln.diaCtsUsed || "—"}</td>
                <td>{ln.diaPcsUsed || "—"}</td>
                <td>{ln.differenceDiaUsed || "—"}</td>
                <td>{ln.totalPrice || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {issue.comments && (
        <div className="card">
          <div className="muted">Comments</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{issue.comments}</div>
        </div>
      )}

      <ReconcileControl
        memoNo={issue.memoNo}
        currentStatus={issue.status}
        receivedDate={issue.receivedDate}
        comments={issue.comments}
        lines={issue.lines.map((ln) => ({
          label:
            (ln.values["Diamond Shape"] || "Line") +
            (ln.values["Diamond Size"] ? ` · ${ln.values["Diamond Size"]}` : ""),
          carats: ln.values["Diamond Carats"] || "",
          diaCtsUsed: ln.diaCtsUsed || "",
          diaPcsUsed: ln.diaPcsUsed || "",
        }))}
      />
    </main>
  );
}

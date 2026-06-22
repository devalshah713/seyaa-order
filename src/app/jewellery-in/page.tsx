import Link from "next/link";
import { listIssues } from "@/lib/diamondIssueStore";
import { isStorageConfigured } from "@/lib/sheetStore";
import { ISSUE_STATUS_LABELS, ISSUE_STATUS_COLORS } from "@/lib/diamondIssueConfig";

export const dynamic = "force-dynamic";

// Memos still waiting to be received (Pending / legacy Issued).
const AWAITING = new Set(["PENDING", "ISSUED", "PARTIAL"]);

// A design's diamonds are issued together and are treated as ONE memo. Each
// design is shown once here, aggregating all of its issued memos/bags.
type DesignGroup = {
  designNumber: string;
  factory: string;
  bags: number;
  date: string;
  receivedDate: string;
  awaiting: boolean;
  status: string;
};

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

  // Group every issued memo by its design number so each design appears once,
  // not once per memo. A design is "awaiting" while any of its memos is pending.
  const byDesign = new Map<string, DesignGroup>();
  for (const i of issues) {
    const key = i.designNumber || "(no design)";
    const g =
      byDesign.get(key) ||
      ({
        designNumber: key,
        factory: i.factory || "",
        bags: 0,
        date: i.date || "",
        receivedDate: "",
        awaiting: false,
        status: i.status,
      } as DesignGroup);
    g.bags += i.lines.length;
    if (!g.factory && i.factory) g.factory = i.factory;
    if (AWAITING.has(i.status)) g.awaiting = true;
    else g.status = i.status; // a representative received status
    if (i.receivedDate) g.receivedDate = i.receivedDate;
    byDesign.set(key, g);
  }
  const groups = Array.from(byDesign.values()).sort((a, b) =>
    b.designNumber.localeCompare(a.designNumber, undefined, { numeric: true })
  );
  const pending = groups.filter((g) => g.awaiting);
  const received = groups.filter((g) => !g.awaiting);

  return (
    <main className="container">
      <div className="row spread" style={{ marginBottom: 20 }}>
        <div>
          <h1>Jewellery In from Manufacturer</h1>
          <p className="muted">
            {pending.length} design{pending.length === 1 ? "" : "s"} awaiting receipt
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
        <div className="card empty">Nothing pending — every issued design has been received.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Design</th>
              <th>Factory</th>
              <th>Bags</th>
              <th>Status</th>
              <th>Issue Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pending.map((g) => (
              <tr key={g.designNumber}>
                <td style={{ fontWeight: 700 }}>{g.designNumber}</td>
                <td>{g.factory || "—"}</td>
                <td className="muted">{g.bags}</td>
                <td>
                  <span className="badge" style={{ background: ISSUE_STATUS_COLORS["PENDING"] }}>
                    {ISSUE_STATUS_LABELS["PENDING"]}
                  </span>
                </td>
                <td className="muted">{g.date || "—"}</td>
                <td>
                  <Link
                    href={`/jewellery-in/new?design=${encodeURIComponent(g.designNumber)}`}
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
                <th>Design</th>
                <th>Bags</th>
                <th>Status</th>
                <th>Received</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {received.slice(0, 25).map((g) => (
                <tr key={g.designNumber}>
                  <td style={{ fontWeight: 700 }}>{g.designNumber}</td>
                  <td className="muted">{g.bags}</td>
                  <td>
                    <span className="badge" style={{ background: ISSUE_STATUS_COLORS[g.status] || "#64748b" }}>
                      {ISSUE_STATUS_LABELS[g.status] || g.status}
                    </span>
                  </td>
                  <td className="muted">{g.receivedDate || "—"}</td>
                  <td>
                    <Link
                      href={`/jewellery-in/new?design=${encodeURIComponent(g.designNumber)}`}
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

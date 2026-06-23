import Link from "next/link";
import { listActivity, isStorageConfigured, AuditEntry } from "@/lib/sheetStore";

export const dynamic = "force-dynamic";

// Best-effort grouping of an action into a module, so the trail can be
// filtered per module. Extend this as new modules are added.
function moduleOf(e: AuditEntry): string {
  const a = e.action.toLowerCase();
  if (a.includes("sell")) return "Sell";
  if (a.includes("stock")) return "Stock";
  if (a.includes("jewellery in") || a.includes("return")) return "Jewellery In";
  if (a.includes("diamond issue")) return "Diamond Issue";
  if (a.includes("order") || a.includes("status")) return "Orders";
  if (a.includes("signed")) return "Account";
  if (a.includes("size")) return "Settings";
  if (a.includes("photo") || a.includes("upload")) return "Uploads";
  if (a.includes("user") || a.includes("member")) return "Team";
  return "Other";
}

// "2026-06-21T09:30:00.000Z" -> "21 Jun 2026, 3:00 PM" (in IST-friendly local)
function formatStamp(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AuditTrailPage({
  searchParams,
}: {
  searchParams: { q?: string; order?: string; module?: string };
}) {
  if (!isStorageConfigured()) {
    return (
      <main className="container">
        <h1>Audit Trail</h1>
        <div className="card" style={{ marginTop: 16 }}>
          <p className="muted">Once the Google Sheet is connected, all activity will appear here.</p>
        </div>
      </main>
    );
  }

  const { q, order, module } = searchParams;
  let entries = await listActivity();

  if (order) entries = entries.filter((e) => e.order === order);
  if (module) entries = entries.filter((e) => moduleOf(e) === module);
  if (q) {
    const needle = q.toLowerCase();
    entries = entries.filter(
      (e) =>
        e.user.toLowerCase().includes(needle) ||
        e.action.toLowerCase().includes(needle) ||
        e.order.toLowerCase().includes(needle) ||
        e.details.toLowerCase().includes(needle)
    );
  }

  const MODULES = ["Orders", "Diamond Issue", "Jewellery In", "Stock", "Sell", "Account", "Uploads", "Team", "Settings"];

  return (
    <main className="container">
      <div className="row spread" style={{ marginBottom: 20 }}>
        <div>
          <h1>Audit Trail</h1>
          <p className="muted">
            {order ? (
              <>
                Activity for <b>{order}</b> · {entries.length} entr{entries.length === 1 ? "y" : "ies"}
              </>
            ) : (
              <>
                Who did what, and when · {entries.length} entr{entries.length === 1 ? "y" : "ies"}
              </>
            )}
          </p>
        </div>
      </div>

      <form className="filters no-print" method="get">
        {order && <input type="hidden" name="order" value={order} />}
        <input name="q" placeholder="Search user, action, reference…" defaultValue={q || ""} />
        {!order && (
          <select name="module" defaultValue={module || ""}>
            <option value="">All modules</option>
            {MODULES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}
        <button className="btn ghost small" type="submit">
          Filter
        </button>
        <Link href={order ? `/audit?order=${encodeURIComponent(order)}` : "/audit"} className="btn ghost small">
          Reset
        </Link>
      </form>

      {entries.length === 0 ? (
        <div className="card empty">No activity recorded yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Employee</th>
              <th>Action</th>
              <th>Module</th>
              <th>Reference</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i}>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{formatStamp(e.timestamp)}</td>
                <td>
                  <b>{e.user}</b>
                  {e.role ? <span className="muted"> · {e.role}</span> : null}
                </td>
                <td>{e.action || "—"}</td>
                <td className="muted">{moduleOf(e)}</td>
                <td>
                  {e.order ? (
                    <Link href={`/audit?order=${encodeURIComponent(e.order)}`}>{e.order}</Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="muted">{e.details || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

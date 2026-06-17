import Link from "next/link";
import { listOrders, isStorageConfigured } from "@/lib/sheetStore";
import { REGIONS, ORDER_STATUSES, STATUS_LABELS, STATUS_COLORS, formatDate } from "@/lib/formConfig";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: { region?: string; status?: string; q?: string };
}) {
  if (!isStorageConfigured()) {
    return (
      <main className="container">
        <h1>Orders</h1>
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Google Sheet not connected yet</h2>
          <p className="muted">
            The app is ready, but it still needs to be linked to your Google
            Sheet. Once the connection is added, your orders will appear here.
          </p>
        </div>
      </main>
    );
  }

  const { region, status, q } = searchParams;

  let orders = await listOrders();

  // Filters
  if (region) orders = orders.filter((o) => o.region === region);
  if (status) orders = orders.filter((o) => o.status === status);
  if (q) {
    const needle = q.toLowerCase();
    orders = orders.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(needle) ||
        o.customerName.toLowerCase().includes(needle)
    );
  }

  return (
    <main className="container">
      <div className="row spread" style={{ marginBottom: 20 }}>
        <div>
          <h1>Orders</h1>
          <p className="muted">
            {orders.length} order{orders.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link href="/orders/new" className="btn gold">
          + New Order
        </Link>
      </div>

      <form className="filters no-print" method="get">
        <input name="q" placeholder="Search order # or customer…" defaultValue={q || ""} />
        <select name="region" defaultValue={region || ""}>
          <option value="">All regions</option>
          {REGIONS.map((r) => (
            <option key={r.name} value={r.name}>
              {r.name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status || ""}>
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <button className="btn ghost small" type="submit">
          Filter
        </button>
        <Link href="/" className="btn ghost small">
          Reset
        </Link>
      </form>

      {orders.length === 0 ? (
        <div className="card empty">
          No orders yet.{" "}
          <Link href="/orders/new" style={{ color: "var(--gold)", fontWeight: 600 }}>
            Create one →
          </Link>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Order #</th>
              <th>Customer</th>
              <th>Region</th>
              <th>Products</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.orderNumber}>
                <td>
                  <Link href={`/orders/${encodeURIComponent(o.orderNumber)}`} style={{ fontWeight: 700 }}>
                    {o.orderNumber}
                  </Link>
                </td>
                <td>
                  <Link href={`/orders/${encodeURIComponent(o.orderNumber)}`}>
                    {o.customerName}
                  </Link>
                </td>
                <td>{o.region}</td>
                <td className="muted">
                  {o.items.map((i) => i.productType).filter(Boolean).join(", ") || "—"}
                </td>
                <td>
                  <span className="badge" style={{ background: STATUS_COLORS[o.status] || "#64748b" }}>
                    {STATUS_LABELS[o.status] || o.status}
                  </span>
                </td>
                <td className="muted">{formatDate(o.date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

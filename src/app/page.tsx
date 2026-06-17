import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { STATUS_LABELS, STATUS_COLORS, ORDER_STATUSES } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: { region?: string; status?: string; q?: string };
}) {
  const { region, status, q } = searchParams;

  const orders = await prisma.order.findMany({
    where: {
      regionId: region || undefined,
      status: status || undefined,
      ...(q
        ? {
            OR: [
              { orderNumber: { contains: q } },
              { customer: { is: { name: { contains: q } } } },
              { salesPerson: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      customer: true,
      region: true,
      items: { include: { productType: true } },
    },
  });

  const regions = await prisma.region.findMany({ orderBy: { name: "asc" } });

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
        <input
          name="q"
          placeholder="Search order #, customer, sales person…"
          defaultValue={q || ""}
        />
        <select name="region" defaultValue={region || ""}>
          <option value="">All regions</option>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>
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
          No orders match. <Link href="/orders/new" style={{ color: "var(--gold)", fontWeight: 600 }}>Create one →</Link>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Order #</th>
              <th>Customer</th>
              <th>Region</th>
              <th>Products</th>
              <th>Sales Person</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} style={{ cursor: "pointer" }}>
                <td>
                  <Link href={`/orders/${o.id}`} style={{ fontWeight: 700 }}>
                    {o.orderNumber}
                  </Link>
                </td>
                <td>
                  <Link href={`/orders/${o.id}`}>{o.customer.name}</Link>
                </td>
                <td>{o.region.name}</td>
                <td className="muted">
                  {o.items.map((i) => i.productType.name).join(", ") || "—"}
                </td>
                <td className="muted">{o.salesPerson || "—"}</td>
                <td>
                  <span
                    className="badge"
                    style={{ background: STATUS_COLORS[o.status] }}
                  >
                    {STATUS_LABELS[o.status]}
                  </span>
                </td>
                <td className="muted">
                  {new Date(o.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

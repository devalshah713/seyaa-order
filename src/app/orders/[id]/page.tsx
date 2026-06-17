import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/status";
import StatusControl from "./StatusControl";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      region: true,
      items: {
        include: {
          productType: true,
          specs: { include: { attribute: true } },
        },
      },
    },
  });

  if (!order) notFound();

  const total = order.items.reduce(
    (sum, it) => sum + (it.price ?? 0) * it.quantity,
    0
  );

  return (
    <main className="container">
      <div className="row spread" style={{ marginBottom: 16 }}>
        <div>
          <Link href="/" className="muted no-print">
            ← All orders
          </Link>
          <h1 style={{ marginTop: 6 }}>{order.orderNumber}</h1>
        </div>
        <div className="row no-print">
          <StatusControl orderId={order.id} current={order.status} />
        </div>
      </div>

      <div className="card">
        <div className="grid3">
          <div>
            <div className="muted">Customer</div>
            <div style={{ fontWeight: 600 }}>{order.customer.name}</div>
            {order.customer.phone && <div className="muted">{order.customer.phone}</div>}
            {order.customer.email && <div className="muted">{order.customer.email}</div>}
          </div>
          <div>
            <div className="muted">Region</div>
            <div style={{ fontWeight: 600 }}>
              {order.region.name} ({order.region.currency})
            </div>
            <div className="muted" style={{ marginTop: 8 }}>
              Sales Person
            </div>
            <div style={{ fontWeight: 600 }}>{order.salesPerson || "—"}</div>
          </div>
          <div>
            <div className="muted">Status</div>
            <span
              className="badge"
              style={{ background: STATUS_COLORS[order.status], marginTop: 4 }}
            >
              {STATUS_LABELS[order.status]}
            </span>
            <div className="muted" style={{ marginTop: 8 }}>
              Created
            </div>
            <div style={{ fontWeight: 600 }}>
              {new Date(order.createdAt).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      <h2 style={{ marginTop: 8 }}>Items</h2>
      {order.items.map((it, idx) => (
        <div className="card" key={it.id}>
          <div className="row spread">
            <strong>
              {idx + 1}. {it.productType.name} &times; {it.quantity}
            </strong>
            {it.price != null && (
              <span className="muted">
                {order.region.currency} {it.price.toLocaleString()} / pc
              </span>
            )}
          </div>
          <div className="spec-grid" style={{ marginTop: 12 }}>
            {it.specs.length === 0 && <div className="muted">No specifications.</div>}
            {it.specs.map((s) => (
              <div key={s.id} className="row" style={{ justifyContent: "space-between" }}>
                <span className="k">
                  {s.attribute.name}
                  {s.attribute.unit ? ` (${s.attribute.unit})` : ""}
                </span>
                <span className="v">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {total > 0 && (
        <div className="card row spread">
          <strong>Estimated Total</strong>
          <strong>
            {order.region.currency} {total.toLocaleString()}
          </strong>
        </div>
      )}

      {order.notes && (
        <div className="card">
          <div className="muted">Notes</div>
          <div>{order.notes}</div>
        </div>
      )}
    </main>
  );
}

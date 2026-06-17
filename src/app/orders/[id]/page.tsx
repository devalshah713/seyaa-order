import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrder } from "@/lib/sheetStore";
import { SPEC_FIELDS, STATUS_LABELS, STATUS_COLORS, currencyForRegion } from "@/lib/formConfig";
import StatusControl from "./StatusControl";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const orderNumber = decodeURIComponent(params.id);
  const order = await getOrder(orderNumber);
  if (!order) notFound();

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
          <StatusControl orderId={order.orderNumber} current={order.status} />
        </div>
      </div>

      <div className="card">
        <div className="grid3">
          <div>
            <div className="muted">Customer</div>
            <div style={{ fontWeight: 600 }}>{order.customerName}</div>
          </div>
          <div>
            <div className="muted">Region</div>
            <div style={{ fontWeight: 600 }}>
              {order.region} {currencyForRegion(order.region) && `(${currencyForRegion(order.region)})`}
            </div>
          </div>
          <div>
            <div className="muted">Status</div>
            <span className="badge" style={{ background: STATUS_COLORS[order.status] || "#64748b", marginTop: 4 }}>
              {STATUS_LABELS[order.status] || order.status}
            </span>
            <div className="muted" style={{ marginTop: 8 }}>
              Date
            </div>
            <div style={{ fontWeight: 600 }}>{order.date || "—"}</div>
          </div>
        </div>
      </div>

      <h2 style={{ marginTop: 8 }}>Items</h2>
      {order.items.map((it, idx) => (
        <div className="card" key={idx}>
          <div className="row spread">
            <strong>
              {idx + 1}. {it["Product Type"] || "Product"} &times; {it["Quantity"] || 1}
            </strong>
          </div>
          <div className="spec-grid" style={{ marginTop: 12 }}>
            {SPEC_FIELDS.map((f) => {
              const value = it[f.name];
              if (!value) return null;
              return (
                <div key={f.name} className="row" style={{ justifyContent: "space-between" }}>
                  <span className="k">
                    {f.name}
                    {f.unit ? ` (${f.unit})` : ""}
                  </span>
                  <span className="v">{value}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {order.notes && (
        <div className="card">
          <div className="muted">Notes</div>
          <div>{order.notes}</div>
        </div>
      )}
    </main>
  );
}

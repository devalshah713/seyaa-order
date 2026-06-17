import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrder } from "@/lib/sheetStore";
import {
  PRODUCT_FIELDS,
  DIAMOND_FIELDS,
  STATUS_LABELS,
  STATUS_COLORS,
  currencyForRegion,
  formatDate,
} from "@/lib/formConfig";
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
          <Link href={`/orders/${encodeURIComponent(order.orderNumber)}/demand`} className="btn ghost">
            Diamond Demand PDF
          </Link>
          <StatusControl orderId={order.orderNumber} current={order.status} />
        </div>
      </div>

      <div className="card">
        <div className="grid3">
          <div>
            <div className="muted">Customer</div>
            <div style={{ fontWeight: 600 }}>{order.customerName}</div>
            <div className="muted" style={{ marginTop: 8 }}>
              Manufacturer
            </div>
            <div style={{ fontWeight: 600 }}>{order.manufacturer || "—"}</div>
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
            <div style={{ fontWeight: 600 }}>{formatDate(order.date) || "—"}</div>
          </div>
        </div>
      </div>

      <h2 style={{ marginTop: 8 }}>Items</h2>
      {order.items.map((it) => (
        <div className="card" key={it.itemNo}>
          <div className="row spread">
            <strong>
              {it.itemNo}. {it.productType || "Product"} &times; {it.quantity || 1}
            </strong>
          </div>

          <div className="spec-grid" style={{ marginTop: 12 }}>
            {PRODUCT_FIELDS.map((f) => {
              const value = it.product[f.name];
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

          {it.diamonds.length > 0 && (
            <div style={{ marginTop: 12 }}>
              {it.diamonds.map((d, di) => (
                <div className="diamond-block" key={di}>
                  <div className="muted" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    Diamond {di + 1}
                    {d["Diamond Shape"] ? ` — ${d["Diamond Shape"]}` : ""}
                  </div>
                  <div className="spec-grid">
                    {DIAMOND_FIELDS.filter((f) => f.name !== "Diamond Shape").map((f) => {
                      const value = d[f.name];
                      if (!value) return null;
                      return (
                        <div key={f.name} className="row" style={{ justifyContent: "space-between" }}>
                          <span className="k">{f.name}</span>
                          <span className="v">{value}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
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

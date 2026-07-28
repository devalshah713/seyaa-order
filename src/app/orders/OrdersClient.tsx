"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  GOLD_COLORS,
  ORDER_STATUSES,
  formatDate,
  orderStatusLabel,
  type OrderStatus,
} from "@/lib/memoFormat";
import type { Order } from "@/lib/memoStore";

const empty = {
  customer: "",
  productName: "",
  goldColor: "",
  diamondCts: "",
  pcs: "1",
  stockNo: "",
  status: "in_production" as OrderStatus,
};

export default function OrdersClient({ orders }: { orders: Order[] }) {
  const router = useRouter();
  const [form, setForm] = useState(empty);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showDelivered, setShowDelivered] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return orders.filter((o) => {
      if (!showDelivered && o.status === "delivered") return false;
      if (!needle) return true;
      return [o.orderNo, o.customer, o.productName, o.goldColor, o.stockNo || ""]
        .join(" ").toLowerCase().includes(needle);
    });
  }, [orders, q, showDelivered]);

  function set(patch: Partial<typeof empty>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.productName.trim()) { setError("Give the order a product name."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add the order.");
      setForm(empty);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the order.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(o: Order, status: OrderStatus) {
    setError("");
    const res = await fetch(`/api/orders/${o.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Could not update the status.");
      return;
    }
    router.refresh();
  }

  async function remove(o: Order) {
    if (!window.confirm(`Delete order ${o.orderNo}? This cannot be undone.`)) return;
    const res = await fetch(`/api/orders/${o.id}`, { method: "DELETE" });
    if (!res.ok) { setError("Could not delete the order."); return; }
    router.refresh();
  }

  return (
    <>
      <form className="order-add" onSubmit={add}>
        <label className="field"><span>Product name</span>
          <input value={form.productName} onChange={(e) => set({ productName: e.target.value })}
            placeholder="Tennis bracelet" required /></label>
        <label className="field"><span>Customer</span>
          <input value={form.customer} onChange={(e) => set({ customer: e.target.value })}
            placeholder="Party name" /></label>
        <label className="field"><span>Gold colour</span>
          <input list="gold-colors" value={form.goldColor}
            onChange={(e) => set({ goldColor: e.target.value })} placeholder="Yellow" /></label>
        <datalist id="gold-colors">
          {GOLD_COLORS.map((c) => <option key={c} value={c} />)}
        </datalist>
        <label className="field"><span>Diamond cts</span>
          <input value={form.diamondCts} inputMode="decimal"
            onChange={(e) => set({ diamondCts: e.target.value })} placeholder="3.01" /></label>
        <label className="field"><span>Pcs</span>
          <input value={form.pcs} inputMode="numeric"
            onChange={(e) => set({ pcs: e.target.value })} /></label>
        <label className="field"><span>Stock No. <em>(remake)</em></span>
          <input value={form.stockNo} onChange={(e) => set({ stockNo: e.target.value })}
            placeholder="optional" /></label>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Adding…" : "Add order"}
        </button>
      </form>

      {error && <p className="save-error">{error}</p>}

      <div className="sheet-controls">
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search order no., customer, product…" />
        <label className="sheet-toggle">
          <input type="checkbox" checked={showDelivered}
            onChange={(e) => setShowDelivered(e.target.checked)} />
          <span>Show delivered</span>
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="empty-state">No orders to show.</p>
      ) : (
        <table className="history">
          <thead>
            <tr>
              <th>Order</th><th>Product</th><th>Gold</th>
              <th className="num">Cts</th><th className="num">Pcs</th>
              <th>Status</th><th className="actions-col" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id}>
                <td className="memono">
                  {o.orderNo}
                  <div className="ev-meta">{formatDate(o.createdAt.slice(0, 10))}</div>
                </td>
                <td>
                  <strong>{o.productName}</strong>
                  {o.customer && <div className="ev-meta">{o.customer}</div>}
                  {o.stockNo && <div className="ev-meta">remake of {o.stockNo}</div>}
                </td>
                <td>{o.goldColor || "—"}</td>
                <td className="num">{o.diamondCts ? o.diamondCts.toFixed(2) : "—"}</td>
                <td className="num">{o.pcs}</td>
                <td>
                  <select value={o.status}
                    onChange={(e) => setStatus(o, e.target.value as OrderStatus)}>
                    {ORDER_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </td>
                <td className="row-actions">
                  <button className="rowbtn danger" onClick={() => remove(o)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

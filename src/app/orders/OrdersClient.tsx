"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  GOLD_COLORS,
  ORDER_STATUSES,
  formatDate,
  type OrderStatus,
} from "@/lib/memoFormat";
import type { Order } from "@/lib/memoStore";

type Draft = {
  customer: string;
  productName: string;
  goldColor: string;
  diamondCts: string;
  pcs: string;
  stockNo: string;
  status: OrderStatus;
  comment: string; // only used by the add form — becomes the order's first note
};

const empty: Draft = {
  customer: "",
  productName: "",
  goldColor: "",
  diamondCts: "",
  pcs: "1",
  stockNo: "",
  status: "in_production",
  comment: "",
};

const draftOf = (o: Order): Draft => ({
  customer: o.customer || "",
  productName: o.productName || "",
  goldColor: o.goldColor || "",
  diamondCts: o.diamondCts ? String(o.diamondCts) : "",
  pcs: String(o.pcs || 1),
  stockNo: o.stockNo || "",
  status: o.status,
  comment: "", // notes are added from the log, never rewritten by an edit
});

export default function OrdersClient({ orders }: { orders: Order[] }) {
  const router = useRouter();
  const [form, setForm] = useState<Draft>(empty);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showDelivered, setShowDelivered] = useState(false);

  // Inline edit: one row at a time, with its own working copy so Cancel
  // genuinely discards rather than half-applying.
  const [editingId, setEditingId] = useState("");
  const [draft, setDraft] = useState<Draft>(empty);
  const [savingEdit, setSavingEdit] = useState(false);

  // Notes panel: one order open at a time.
  const [openNotes, setOpenNotes] = useState("");
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return orders.filter((o) => {
      if (!showDelivered && o.status === "delivered") return false;
      if (!needle) return true;
      return [o.orderNo, o.customer, o.productName, o.goldColor, o.stockNo || ""]
        .join(" ").toLowerCase().includes(needle);
    });
  }, [orders, q, showDelivered]);

  const set = (patch: Partial<Draft>) => setForm((f) => ({ ...f, ...patch }));
  const setD = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

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

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || "Could not save the order.");
    }
  }

  function startEdit(o: Order) {
    setError("");
    setEditingId(o.id);
    setDraft(draftOf(o));
  }

  async function saveEdit(id: string) {
    setError("");
    if (!draft.productName.trim()) { setError("Give the order a product name."); return; }
    setSavingEdit(true);
    try {
      await patch(id, draft);
      setEditingId("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the order.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function setStatus(o: Order, status: OrderStatus) {
    setError("");
    try {
      await patch(o.id, { status });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the status.");
    }
  }

  async function addNote(id: string) {
    if (!note.trim()) return;
    setError("");
    setSavingNote(true);
    try {
      const res = await fetch(`/api/orders/${id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: note }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not save the note.");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the note.");
    } finally {
      setSavingNote(false);
    }
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
        <label className="field oa-comment"><span>Comment <em>(optional)</em></span>
          <input value={form.comment} onChange={(e) => set({ comment: e.target.value })}
            placeholder="e.g. wants it by Friday — saved as the first note" /></label>
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
        <table className="history orders-table">
          <thead>
            <tr>
              <th>Order</th><th>Product</th><th>Gold</th>
              <th className="num">Cts</th><th className="num">Pcs</th>
              <th>Status</th><th className="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => {
              const editing = editingId === o.id;
              return (
                <tr key={o.id} className={editing ? "editing" : ""}>
                  <td className="memono">
                    {o.orderNo}
                    <div className="ev-meta">{formatDate(o.createdAt.slice(0, 10))}</div>
                  </td>

                  {editing ? (
                    <>
                      <td>
                        <input className="ed" value={draft.productName}
                          onChange={(e) => setD({ productName: e.target.value })} placeholder="Product" />
                        <input className="ed" value={draft.customer}
                          onChange={(e) => setD({ customer: e.target.value })} placeholder="Customer" />
                        <input className="ed" value={draft.stockNo}
                          onChange={(e) => setD({ stockNo: e.target.value })} placeholder="Stock No. (remake)" />
                      </td>
                      <td>
                        <input className="ed" list="gold-colors" value={draft.goldColor}
                          onChange={(e) => setD({ goldColor: e.target.value })} placeholder="Gold" />
                      </td>
                      <td className="num">
                        <input className="ed num" value={draft.diamondCts} inputMode="decimal"
                          onChange={(e) => setD({ diamondCts: e.target.value })} />
                      </td>
                      <td className="num">
                        <input className="ed num" value={draft.pcs} inputMode="numeric"
                          onChange={(e) => setD({ pcs: e.target.value })} />
                      </td>
                      <td>
                        <select value={draft.status}
                          onChange={(e) => setD({ status: e.target.value as OrderStatus })}>
                          {ORDER_STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="row-actions">
                        <button className="rowbtn" onClick={() => saveEdit(o.id)} disabled={savingEdit}>
                          {savingEdit ? "Saving…" : "Save"}
                        </button>
                        <button className="rowbtn" onClick={() => setEditingId("")} disabled={savingEdit}>
                          Cancel
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        <strong>{o.productName}</strong>
                        {o.customer && <div className="ev-meta">{o.customer}</div>}
                        {o.stockNo && <div className="ev-meta">remake of {o.stockNo}</div>}
                        {/* Notes read in the row itself — the point of a note is
                            being seen without going looking for it. */}
                        {(o.comments || []).slice().reverse().map((c) => (
                          <div key={c.id} className="row-note">
                            {c.text}
                            <em>{c.by}</em>
                          </div>
                        ))}
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
                        <button
                          className="rowbtn"
                          onClick={() => { setOpenNotes(openNotes === o.id ? "" : o.id); setNote(""); }}
                        >
                          + Note
                        </button>
                        <button className="rowbtn" onClick={() => startEdit(o)}>Edit</button>
                        <button className="rowbtn danger" onClick={() => remove(o)}>Delete</button>
                      </td>
                    </>
                  )}
                </tr>
              );
            }).flatMap((rowEl, i) => {
              const o = filtered[i];
              // The notes themselves are in the row above; this strip is only
              // for writing a new one.
              if (openNotes !== o.id) return [rowEl];
              return [
                rowEl,
                <tr key={`${o.id}-add`} className="notes-row">
                  <td colSpan={7}>
                    <div className="note-add">
                      <input
                        autoFocus
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); void addNote(o.id); }
                          if (e.key === "Escape") { setOpenNotes(""); setNote(""); }
                        }}
                        placeholder={`Note on ${o.orderNo} — e.g. customer wants 18 inch`}
                      />
                      <button className="btn btn-primary" onClick={() => addNote(o.id)}
                        disabled={savingNote || !note.trim()}>
                        {savingNote ? "Saving…" : "Add note"}
                      </button>
                      <button className="btn" onClick={() => { setOpenNotes(""); setNote(""); }}>
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>,
              ];
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

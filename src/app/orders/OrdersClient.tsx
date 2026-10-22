"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GOLD_COLORS,
  ORDER_STATUSES,
  approvalLabel,
  approvalLine,
  approvalOf,
  formatDate,
  stageOf,
  type OrderStatus,
} from "@/lib/memoFormat";
import type { Order } from "@/lib/memoStore";
import { readReply } from "@/lib/readReply";

type Draft = {
  customer: string;
  productName: string;
  goldColor: string;
  diamondCts: string;
  pcs: string;
  stockNo: string;
  size: string;
  instructions: string;
  status: OrderStatus;
  comment: string;
};

const empty: Draft = {
  customer: "",
  productName: "",
  goldColor: "",
  diamondCts: "",
  pcs: "1",
  stockNo: "",
  size: "",
  instructions: "",
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
  size: o.size || "",
  instructions: o.instructions || "",
  status: o.status,
  comment: "", // notes are added from the log, never rewritten by an edit
});

export type Viewer = { uid: string; username: string; isAdmin: boolean };

const COLUMNS = 9;

// When an order was entered, to the minute. The minute matters here: two
// orders taken in the same morning are told apart by it.
const stampOf = (o: Order) =>
  `${formatDate(o.createdAt.slice(0, 10))} ${o.createdAt.slice(11, 16)}`;

export default function OrdersClient({ orders, me }: { orders: Order[]; me: Viewer }) {
  const router = useRouter();
  const [q, setQ] = useState("");
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

  // Sending one back: the reason is typed on the row it belongs to.
  const [backId, setBackId] = useState("");
  const [reason, setReason] = useState("");
  const [busyApproval, setBusyApproval] = useState("");

  // Nobody approves their own order at either stage, an admin's own included.
  // An admin stands in for any manager, and the owner's stage is admins only.
  const canApprove = (o: Order) =>
    approvalOf(o) === "waiting" &&
    o.enteredBy !== me.username &&
    (stageOf(o) === "owner" ? me.isAdmin : me.isAdmin || o.approverId === me.uid);

  // What the owner needs: everything waiting, at either stage, under every
  // manager. What a manager needs: the ones waiting on them.
  const waiting = useMemo(
    () =>
      orders.filter(
        (o) =>
          approvalOf(o) === "waiting" &&
          (me.isAdmin || (stageOf(o) === "manager" && o.approverId === me.uid))
      ),
    [orders, me]
  );

  // Orders of mine that came back, with the reason, so the correction starts
  // from the page I was already on.
  const mine = useMemo(
    () => orders.filter((o) => approvalOf(o) === "sent_back" && o.enteredBy === me.username),
    [orders, me]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return orders.filter((o) => {
      if (!showDelivered && o.status === "delivered") return false;
      if (!needle) return true;
      return [
        o.orderNo, o.customer, o.productName, o.goldColor, o.stockNo || "",
        o.category || "", o.subCategory || "", o.size || "", o.diaShape || "",
        o.designNo || "", o.mfg || "", o.enteredBy || "", approvalLine(o),
        o.pdNo || "",
      ].join(" ").toLowerCase().includes(needle);
    });
  }, [orders, q, showDelivered]);

  const setD = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

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

  async function approval(id: string, action: string, why?: string) {
    setError("");
    setBusyApproval(id);
    try {
      const res = await fetch(`/api/orders/${id}/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: why || "" }),
      });
      await readReply(res, "Could not save that.");
      setBackId("");
      setReason("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that.");
    } finally {
      setBusyApproval("");
    }
  }

  function startEdit(o: Order) {
    setError("");
    setEditingId(o.id);
    setDraft(draftOf(o));
  }

  async function saveEdit(id: string) {
    setError("");
    if (!draft.productName.trim()) { setError("Write what is being made."); return; }
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
      <datalist id="gold-colors">
        {GOLD_COLORS.map((c) => <option key={c} value={c} />)}
      </datalist>

      {waiting.length > 0 && (
        <div className="ord-queue">
          <h2>
            {me.isAdmin ? "Waiting for approval" : "Waiting for your approval"}
            <span className="q-count">{waiting.length}</span>
          </h2>
          {waiting.map((o) => (
            <div key={o.id} className="ord-q-row">
              <div>
                <Link href={`/orders/${o.id}`} className="q-no">{o.orderNo}</Link>
                <strong>{o.productName}</strong>
                <span className="ev-meta">
                  {o.pcs} pcs · {o.goldColor || "gold not set"}
                  {o.size ? ` · ${o.size}` : ""} · entered by {o.enteredBy || "unknown"} on{" "}
                  {stampOf(o)}
                </span>
                {/* Which of the two signatures this one is sitting on, by name
                    where there is a name. Shown to everybody in the queue: a
                    manager has to know when his part is done and the order has
                    moved on. */}
                <span className="ev-meta">{approvalLine(o)}</span>
              </div>
              <div className="q-actions">
                {canApprove(o) ? (
                  <>
                    <button
                      className="btn btn-primary"
                      disabled={busyApproval === o.id}
                      onClick={() => approval(o.id, "approve")}
                    >
                      Approve
                    </button>
                    <button
                      className="btn"
                      disabled={busyApproval === o.id}
                      onClick={() => { setBackId(backId === o.id ? "" : o.id); setReason(""); }}
                    >
                      Send back
                    </button>
                  </>
                ) : (
                  <span className="hint">
                    {o.enteredBy === me.username
                      ? "You entered this one, so somebody else approves it."
                      : `${approvalLine(o)}.`}
                  </span>
                )}
              </div>
              {backId === o.id && (
                <div className="q-back">
                  <input
                    autoFocus
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why is it going back? One line."
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && reason.trim()) {
                        e.preventDefault();
                        void approval(o.id, "send_back", reason);
                      }
                      if (e.key === "Escape") { setBackId(""); setReason(""); }
                    }}
                  />
                  <button
                    className="btn btn-primary"
                    disabled={!reason.trim() || busyApproval === o.id}
                    onClick={() => approval(o.id, "send_back", reason)}
                  >
                    Send it back
                  </button>
                  <button className="btn" onClick={() => { setBackId(""); setReason(""); }}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {mine.length > 0 && (
        <div className="ord-queue ord-back">
          <h2>Sent back to you<span className="q-count">{mine.length}</span></h2>
          {mine.map((o) => (
            <div key={o.id} className="ord-q-row">
              <div>
                <Link href={`/orders/${o.id}`} className="q-no">{o.orderNo}</Link>
                <strong>{o.productName}</strong>
                <span className="ev-meta">
                  {o.sentBackReason || "No reason was written."}
                </span>
              </div>
              <div className="q-actions">
                <Link href={`/orders/${o.id}`} className="btn">Open it</Link>
                <button
                  className="btn btn-primary"
                  disabled={busyApproval === o.id}
                  onClick={() => approval(o.id, "resubmit")}
                >
                  Send in again
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="save-error">{error}</p>}

      <div className="sheet-controls">
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search order no., product, category, size, who entered it…" />
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
              <th>Order</th><th>What is being made</th><th>Gold</th><th>Size &amp; shape</th>
              <th className="num">Cts</th><th className="num">Pcs</th>
              <th>Approval</th><th>Status</th><th className="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => {
              const editing = editingId === o.id;
              const mark = approvalOf(o);
              return (
                <tr key={o.id} className={editing ? "editing" : ""}>
                  <td className="memono">
                    <Link href={`/orders/${o.id}`}>{o.orderNo}</Link>
                    <div className="ev-meta">{stampOf(o)}</div>
                    <div className="ev-meta">by {o.enteredBy || "not recorded"}</div>
                  </td>

                  {editing ? (
                    <>
                      <td>
                        <input className="ed" value={draft.productName}
                          onChange={(e) => setD({ productName: e.target.value })} placeholder="What is being made" />
                        <input className="ed" value={draft.customer}
                          onChange={(e) => setD({ customer: e.target.value })} placeholder="Party" />
                        <input className="ed" value={draft.stockNo}
                          onChange={(e) => setD({ stockNo: e.target.value })} placeholder="Stock No. (remake)" />
                        <input className="ed" value={draft.instructions}
                          onChange={(e) => setD({ instructions: e.target.value })} placeholder="Special instructions" />
                      </td>
                      <td data-label="Gold">
                        <input className="ed" list="gold-colors" value={draft.goldColor}
                          onChange={(e) => setD({ goldColor: e.target.value })} placeholder="Gold" />
                      </td>
                      <td data-label="Size and shape">
                        <input className="ed" value={draft.size}
                          onChange={(e) => setD({ size: e.target.value })} placeholder="Size" />
                        <div className="ev-meta">{o.diaShape || "shape not set"}</div>
                      </td>
                      <td className="num" data-label="Cts">
                        <input className="ed num" value={draft.diamondCts} inputMode="decimal"
                          onChange={(e) => setD({ diamondCts: e.target.value })} />
                      </td>
                      <td className="num" data-label="Pcs">
                        <input className="ed num" value={draft.pcs} inputMode="numeric"
                          onChange={(e) => setD({ pcs: e.target.value })} />
                      </td>
                      <td className={`ord-mark m-${mark}`} data-label="Approval">{approvalLabel(o)}</td>
                      <td data-label="Status">
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
                        {(o.category || o.subCategory) && (
                          <div className="ev-meta">
                            {[o.category, o.subCategory, o.subSubCategory].filter(Boolean).join(" · ")}
                          </div>
                        )}
                        {o.designNo && <div className="ev-meta">design {o.designNo}</div>}
                        {o.mfg && <div className="ev-meta">making: {o.mfg}</div>}
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
                      <td className="c-detail" data-label="Gold">{o.goldColor || "—"}</td>
                      <td className="c-detail" data-label="Size and shape">
                        {[o.size, o.diaShape].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="num c-detail" data-label="Cts">
                        {o.diamondCts ? o.diamondCts.toFixed(2) : "—"}
                      </td>
                      <td className="num c-detail" data-label="Pcs">{o.pcs}</td>
                      <td className={`ord-mark m-${mark}`} data-label="Approval">
                        {approvalLabel(o)}
                        {mark === "waiting" && (
                          <div className="ev-meta">
                            {stageOf(o) === "owner"
                              ? "the owner"
                              : `from ${o.approverName || "a manager"}`}
                          </div>
                        )}
                        {o.pdNo && <div className="ev-meta">PD {o.pdNo}</div>}
                      </td>
                      <td data-label="Status">
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
                  <td colSpan={COLUMNS}>
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

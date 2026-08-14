"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/lib/memoFormat";
import type { PdSheet } from "@/lib/pdStore";

export default function PdHistoryTable({ sheets }: { sheets: PdSheet[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return sheets;
    return sheets.filter((s) =>
      [s.pdNo, s.sku, s.product, s.category, s.subCategory, s.assignedTo,
       s.pdMerchandiser, s.zone, s.orderType, s.diaQuality]
        .join(" ").toLowerCase().includes(needle)
    );
  }, [q, sheets]);

  async function del(s: PdSheet) {
    if (!window.confirm(`Delete PD sheet ${s.sku || s.pdNo}? This cannot be undone.`)) return;
    setError("");
    setBusyId(s.id);
    try {
      const res = await fetch(`/api/pd/${s.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not delete.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <>
      <input
        className="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search SKU, product, category, designer…"
      />
      {error && <p className="save-error" style={{ marginTop: 0 }}>{error}</p>}
      <table className="history">
        <thead>
          <tr>
            <th>SKU No.</th>
            <th>Product</th>
            <th>Assigned to</th>
            <th>Delivery</th>
            <th className="num">Qty</th>
            <th className="actions-col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((s) => (
            <tr key={s.id} onClick={() => router.push(`/pd/${s.id}`)}>
              <td className="memono" style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12 }}>
                {s.sku || s.pdNo}
              </td>
              <td>{s.product || "—"}</td>
              <td>{s.assignedTo || "—"}</td>
              <td>{s.deliveryDate ? formatDate(s.deliveryDate) : "—"}</td>
              <td className="num">{s.quantity || "—"}</td>
              <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                <a href={`/api/pd/${s.id}/pdf`} className="rowbtn" title="Download PDF">PDF</a>
                <Link href={`/pd/${s.id}/edit`} className="rowbtn">Edit</Link>
                <button className="rowbtn danger" onClick={() => del(s)} disabled={busyId === s.id}>
                  {busyId === s.id ? "Deleting…" : "Delete"}
                </button>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--panel-muted)" }}>No matches.</td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}

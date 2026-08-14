"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/lib/memoFormat";
import { totalPcs } from "@/lib/demandConfig";
import type { Demand } from "@/lib/demandStore";

export default function DemandHistoryTable({ demands }: { demands: Demand[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return demands;
    return demands.filter((d) =>
      [d.demandNo, d.issuedTo, d.pdNo || "",
       ...d.rows.map((r) => `${r.designNo} ${r.shape} ${r.pointers} ${r.growth}`)]
        .join(" ").toLowerCase().includes(needle)
    );
  }, [q, demands]);

  async function del(d: Demand) {
    if (!window.confirm(`Delete demand ${d.demandNo}? This cannot be undone.`)) return;
    setError(""); setBusyId(d.id);
    try {
      const res = await fetch(`/api/demand/${d.id}`, { method: "DELETE" });
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
      <input className="search" value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Search demand no., design no., shape…" />
      {error && <p className="save-error" style={{ marginTop: 0 }}>{error}</p>}
      <table className="history">
        <thead>
          <tr>
            <th>Demand No.</th><th>Date</th><th>Designs</th>
            <th className="num">Pcs</th><th className="actions-col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((d) => {
            const designs = Array.from(new Set(d.rows.map((r) => r.designNo).filter(Boolean)));
            return (
              <tr key={d.id} onClick={() => router.push(`/demand/${d.id}`)}>
                <td className="memono">{d.demandNo}</td>
                <td>{formatDate(d.date)}</td>
                <td style={{ fontSize: 12 }}>
                  {designs.length ? designs.join(", ") : "—"}
                </td>
                <td className="num">{totalPcs(d.rows) || "—"}</td>
                <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                  <a href={`/api/demand/${d.id}/pdf`} className="rowbtn" title="Download PDF">PDF</a>
                  <Link href={`/demand/${d.id}/edit`} className="rowbtn">Edit</Link>
                  <button className="rowbtn danger" onClick={() => del(d)} disabled={busyId === d.id}>
                    {busyId === d.id ? "Deleting…" : "Delete"}
                  </button>
                </td>
              </tr>
            );
          })}
          {filtered.length === 0 && (
            <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--panel-muted)" }}>No matches.</td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}

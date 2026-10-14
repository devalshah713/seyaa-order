"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/lib/memoFormat";
import type { DemandListRow } from "@/lib/demandStore";

// This table is a client component, so every field it is given is written into
// the page the server sends. It is therefore given rows rather than whole
// demands (see DemandListRow), and in particular it is not given each demand's
// diamond rows: the designs, the piece total and the searchable text are all
// worked out on the server, which is also where they were cheapest to make.

export default function DemandHistoryTable({ demands }: { demands: DemandListRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return demands;
    // The row carries the same text the browser used to join together here, in
    // the same order and already lower-cased, so a search matches what it
    // always matched.
    return demands.filter((d) => d.search.includes(needle));
  }, [q, demands]);

  async function del(d: DemandListRow) {
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
          {filtered.map((d) => (
            <tr key={d.id} onClick={() => router.push(`/demand/${d.id}`)}>
              <td className="memono">{d.demandNo}</td>
              <td>{formatDate(d.date)}</td>
              <td style={{ fontSize: 12 }}>
                {d.designs.length ? d.designs.join(", ") : "—"}
              </td>
              <td className="num">{d.pcs || "—"}</td>
              <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                <a
                  href={`/demand/${d.id}?pdf=1&print=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rowbtn"
                  title="Open the demand and print it"
                >Print</a>
                <Link href={`/demand/${d.id}/edit`} className="rowbtn">Edit</Link>
                <button className="rowbtn danger" onClick={() => del(d)} disabled={busyId === d.id}>
                  {busyId === d.id ? "Deleting…" : "Delete"}
                </button>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--panel-muted)" }}>No matches.</td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}

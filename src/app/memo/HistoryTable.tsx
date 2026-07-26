"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/lib/memoFormat";
import type { Memo } from "@/lib/memoStore";

export default function HistoryTable({ memos }: { memos: Memo[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return memos;
    return memos.filter((m) => {
      const hay = [
        m.memoNo, m.to, m.through, m.mobile, m.purpose,
        ...m.items.map((it) => it.type),
        ...m.items.flatMap((it) => it.stockNos),
      ].join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [q, memos]);

  async function del(m: Memo) {
    if (!window.confirm(`Delete memo ${m.memoNo}? This cannot be undone.`)) return;
    setError("");
    setBusyId(m.id);
    try {
      const res = await fetch(`/api/memos/${m.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not delete the memo.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the memo.");
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
        placeholder="Search memo no., recipient, stock number…"
      />
      {error && <p className="save-error" style={{ marginTop: 0 }}>{error}</p>}
      <table className="history">
        <thead>
          <tr>
            <th>Memo No.</th>
            <th>Date</th>
            <th>To</th>
            <th>Purpose</th>
            <th className="num">Pcs</th>
            <th className="actions-col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((m) => (
            <tr key={m.id} onClick={() => router.push(`/memo/${m.id}`)}>
              <td className="memono">{m.memoNo}</td>
              <td>{formatDate(m.date)}</td>
              <td>{m.to || "—"}</td>
              <td>{m.purpose}</td>
              <td className="num">{m.totalPcs}</td>
              <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                {m.driveLink && (
                  <a href={m.driveLink} target="_blank" rel="noopener noreferrer" className="rowbtn" title="Open in Google Drive">Drive ↗</a>
                )}
                <Link href={`/memo/${m.id}/edit`} className="rowbtn">Edit</Link>
                <button
                  className="rowbtn danger"
                  onClick={() => del(m)}
                  disabled={busyId === m.id}
                >
                  {busyId === m.id ? "Deleting…" : "Delete"}
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

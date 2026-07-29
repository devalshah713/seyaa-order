"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fmtWeight, formatDate, linesFor, statusLabel, statusOf, type StockEvent } from "@/lib/memoFormat";
import type { Memo } from "@/lib/memoStore";

export default function HistoryTable({ memos, events }: { memos: Memo[]; events: StockEvent[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "jewellery" | "gold">("all");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const counts = useMemo(
    () => ({
      all: memos.length,
      jewellery: memos.filter((m) => m.kind !== "gold").length,
      gold: memos.filter((m) => m.kind === "gold").length,
    }),
    [memos]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const byKind =
      kind === "all" ? memos : memos.filter((m) => (kind === "gold" ? m.kind === "gold" : m.kind !== "gold"));
    if (!needle) return byKind;
    return byKind.filter((m) => {
      const hay = [
        m.memoNo, m.to, m.through, m.mobile, m.purpose, m.againstMemoNo || "",
        ...m.items.map((it) => it.type),
        ...m.items.flatMap((it) => it.stockNos),
        ...(m.goldItems || []).map((r) => r.description),
      ].join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [q, memos, kind]);

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
      {/* The two books are kept separately elsewhere (SS/… and SG/…), so the
          history should be readable one book at a time too. */}
      <div className="kind-tabs" role="group" aria-label="Filter memos by type">
        {([
          ["all", "All"],
          ["jewellery", "Jewellery"],
          ["gold", "Gold"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={kind === value ? "active" : ""}
            onClick={() => setKind(value)}
            aria-pressed={kind === value}
          >
            {label}<span>{counts[value]}</span>
          </button>
        ))}
      </div>

      <input
        className="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search memo no., recipient, stock number, gold description…"
      />
      {error && <p className="save-error" style={{ marginTop: 0 }}>{error}</p>}
      <table className="history">
        <thead>
          <tr>
            <th>Memo No.</th>
            <th>Date</th>
            <th>To</th>
            <th>Purpose</th>
            <th className="num">Qty</th>
            <th>Status</th>
            <th className="actions-col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((m) => (
            <tr key={m.id} onClick={() => router.push(`/memo/${m.id}`)}>
              <td className="memono">
                {m.memoNo}
                {m.kind === "gold" && <span className="kind-tag">Gold</span>}
              </td>
              <td>{formatDate(m.date)}</td>
              <td>{m.to || "—"}</td>
              <td>{m.purpose}</td>
              <td className="num">
                {m.kind === "gold"
                  ? `${fmtWeight(m.totalFineWt)} g fine`
                  : `${m.totalPcs} ${m.totalPcs === 1 ? "pc" : "pcs"}`}
              </td>
              <td>
                {m.kind === "gold" ? (
                  <span className="status-pill closed">—</span>
                ) : (() => {
                  const lines = linesFor(m.id, m.items, events);
                  const st = statusOf(lines);
                  return <span className={`status-pill ${st}`}>{statusLabel(st, lines)}</span>;
                })()}
              </td>
              <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                <a href={`/api/memos/${m.id}/pdf`} className="rowbtn" title="Download PDF">PDF</a>
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
            <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--panel-muted)" }}>No matches.</td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}

"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  fmtWeight,
  formatDate,
  linesFor,
  statusLabel,
  statusOf,
  type MemoStatus,
  type StockEvent,
} from "@/lib/memoFormat";
import type { Memo } from "@/lib/memoStore";

export default function HistoryTable({ memos, events }: { memos: Memo[]; events: StockEvent[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "jewellery" | "gold">("all");
  const [fTo, setFTo] = useState("");
  const [fPurpose, setFPurpose] = useState("");
  const [fStatus, setFStatus] = useState<"" | MemoStatus>("");
  const [fFrom, setFFrom] = useState("");
  const [fUntil, setFUntil] = useState("");
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

  // Status is derived from the stock events, so work it out once per memo
  // rather than inside both the filter and the render.
  const withStatus = useMemo(
    () =>
      memos.map((m) => {
        if (m.kind === "gold") return { memo: m, status: null as MemoStatus | null, lines: [] };
        const lines = linesFor(m.id, m.items, events);
        return { memo: m, status: statusOf(lines), lines };
      }),
    [memos, events]
  );

  const options = useMemo(() => {
    const src = kind === "all" ? withStatus : withStatus.filter((r) =>
      kind === "gold" ? r.memo.kind === "gold" : r.memo.kind !== "gold");
    const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return {
      to: uniq(src.map((r) => r.memo.to)),
      purpose: uniq(src.map((r) => r.memo.purpose)),
    };
  }, [withStatus, kind]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = kind === "all" ? withStatus : withStatus.filter((r) =>
      kind === "gold" ? r.memo.kind === "gold" : r.memo.kind !== "gold");

    if (fTo) rows = rows.filter((r) => r.memo.to === fTo);
    if (fPurpose) rows = rows.filter((r) => r.memo.purpose === fPurpose);
    if (fStatus) rows = rows.filter((r) => r.status === fStatus);
    if (fFrom) rows = rows.filter((r) => r.memo.date >= fFrom);
    if (fUntil) rows = rows.filter((r) => r.memo.date <= fUntil);

    const byKind = rows.map((r) => r.memo);
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
  }, [q, withStatus, kind, fTo, fPurpose, fStatus, fFrom, fUntil]);

  const anyFilter = fTo || fPurpose || fStatus || fFrom || fUntil;
  function clearFilters() {
    setFTo(""); setFPurpose(""); setFStatus(""); setFFrom(""); setFUntil("");
  }

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
          {/* Filters sit under their own column so it is obvious what each one
              acts on. Options come from the memos actually present, narrowed
              by the Jewellery/Gold tab above. */}
          <tr className="filter-row">
            <th />
            <th>
              <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)}
                aria-label="From date" title="From date" />
              <input type="date" value={fUntil} onChange={(e) => setFUntil(e.target.value)}
                aria-label="To date" title="To date" />
            </th>
            <th>
              <select value={fTo} onChange={(e) => setFTo(e.target.value)} aria-label="Filter by recipient">
                <option value="">All</option>
                {options.to.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </th>
            <th>
              <select value={fPurpose} onChange={(e) => setFPurpose(e.target.value)} aria-label="Filter by purpose">
                <option value="">All</option>
                {options.purpose.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </th>
            <th />
            <th>
              <select value={fStatus} onChange={(e) => setFStatus(e.target.value as "" | MemoStatus)}
                aria-label="Filter by status">
                <option value="">All</option>
                <option value="out">Out</option>
                <option value="partial">Part settled</option>
                <option value="closed">Closed</option>
              </select>
            </th>
            <th className="actions-col">
              {anyFilter && (
                <button type="button" className="rowbtn" onClick={clearFilters}>Clear</button>
              )}
            </th>
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

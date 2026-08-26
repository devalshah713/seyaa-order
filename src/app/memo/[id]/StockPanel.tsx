"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  STOCK_OUTCOMES,
  eventDate,
  formatDate,
  outcomeLabel,
  statusLabel,
  statusOf,
  todayInput,
  type StockLine,
  type StockOutcome,
} from "@/lib/memoFormat";

type Staged = { outcome: StockOutcome | ""; replacedBy: string; note: string };

const blank: Staged = { outcome: "", replacedBy: "", note: "" };

export default function StockPanel({
  memoId,
  lines,
}: {
  memoId: string;
  lines: StockLine[];
}) {
  const router = useRouter();
  const [staged, setStaged] = useState<Record<string, Staged>>({});
  const [onDate, setOnDate] = useState(todayInput());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const status = useMemo(() => statusOf(lines), [lines]);
  const pending = Object.entries(staged).filter(([, s]) => s.outcome);

  function set(stockNo: string, patch: Partial<Staged>) {
    setStaged((s) => ({ ...s, [stockNo]: { ...(s[stockNo] || blank), ...patch } }));
  }

  // A memo usually resolves one way for the whole lot: everything came back, or
  // everything was handed over. Only pieces still out are set — one already
  // settled keeps whatever was recorded against it.
  function markAll(outcome: StockOutcome) {
    const next: Record<string, Staged> = { ...staged };
    for (const l of lines) if (!l.outcome) next[l.stockNo] = { ...blank, outcome };
    setStaged(next);
  }

  const stillOut = lines.filter((l) => !l.outcome).length;

  async function record() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/memos/${memoId}/stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onDate,
          entries: pending.map(([stockNo, s]) => ({
            stockNo,
            outcome: s.outcome,
            replacedBy: s.replacedBy,
            note: s.note,
          })),
        }),
      });
      if (res.status === 401) {
        setError("You were signed out. Sign in again in a new tab, then press Record again.");
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not record.");
      setStaged({});
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stock-panel no-print">
      <div className="sp-head">
        <h2>Pieces on this memo</h2>
        <span className={`status-pill ${status}`}>{statusLabel(status, lines)}</span>
        {stillOut > 0 && (
          <div className="sp-markall">
            <span className="sp-markall-lab">
              Mark all {stillOut} still out as
            </span>
            <button type="button" className="btn" onClick={() => markAll("returned")}>
              Returned
            </button>
            <button type="button" className="btn" onClick={() => markAll("delivered")}>
              Delivered
            </button>
          </div>
        )}
      </div>

      <table className="stock-table">
        <thead>
          <tr><th>Stock No.</th><th>Type</th><th>Status</th><th>Record outcome</th></tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const s = staged[l.stockNo] || blank;
            return (
              <tr key={l.stockNo} className={l.outcome ? "settled" : ""}>
                <td className="sn">{l.stockNo}</td>
                <td>{l.type}</td>
                <td>
                  <span className={`out-tag ${l.outcome || "open"}`}>{outcomeLabel(l.outcome)}</span>
                  {l.event && (
                    <div className="ev-meta">
                      {formatDate(eventDate(l.event))} · {l.event.by}
                      {l.event.replacedBy && <> · → {l.event.replacedBy}</>}
                      {l.event.note && <> · {l.event.note}</>}
                    </div>
                  )}
                </td>
                <td>
                  <select
                    value={s.outcome}
                    onChange={(e) => set(l.stockNo, { outcome: e.target.value as StockOutcome | "" })}
                  >
                    <option value="">{l.outcome ? "— no change —" : "— still out —"}</option>
                    {STOCK_OUTCOMES.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  {s.outcome === "exchanged" && (
                    <input
                      className="sp-extra"
                      value={s.replacedBy}
                      onChange={(e) => set(l.stockNo, { replacedBy: e.target.value })}
                      placeholder="Replaced by stock no."
                    />
                  )}
                  {(s.outcome === "lost" || s.outcome === "sold" || s.outcome === "delivered") && (
                    <input
                      className="sp-extra"
                      value={s.note}
                      onChange={(e) => set(l.stockNo, { note: e.target.value })}
                      placeholder={
                        s.outcome === "lost"
                          ? "What happened?"
                          : s.outcome === "delivered"
                            ? "Delivered to / reference (optional)"
                            : "Bill / invoice no. (optional)"
                      }
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {error && <p className="save-error">{error}</p>}

      <div className="sp-actions">
        <label className="sp-date">
          <span>Movement date</span>
          <input type="date" value={onDate} onChange={(e) => setOnDate(e.target.value)} />
        </label>
        <button className="btn btn-primary" onClick={record} disabled={busy || !pending.length}>
          {busy ? "Recording…" : pending.length ? `Record ${pending.length} change${pending.length === 1 ? "" : "s"}` : "Record"}
        </button>
        <p className="sp-hint">
          The date the goods actually moved — set it back if you are entering this after the fact.
          Entries are only added, never replaced, so recording a piece again leaves the earlier
          entry in the trail and makes the new one current.
        </p>
      </div>
    </div>
  );
}

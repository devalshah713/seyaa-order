"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { eventDate, formatDate, outcomeLabel, type StockEvent, type StockOutcome } from "@/lib/memoFormat";

type Row = {
  stockNo: string;
  type: string;
  memos: number;
  current: StockOutcome | null;
  lastMemoNo: string;
  lastDate: string;
};

type Entry = {
  memoId: string;
  memoNo: string;
  to: string;
  date: string;
  type: string;
  outcome: StockOutcome | null;
  event?: StockEvent;
};

export default function StockClient({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState("");
  const [history, setHistory] = useState<Entry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toUpperCase();
    if (!needle) return rows;
    return rows.filter((r) => r.stockNo.includes(needle) || r.type.toUpperCase().includes(needle));
  }, [q, rows]);

  async function show(stockNo: string) {
    if (open === stockNo) { setOpen(""); setHistory(null); return; }
    setOpen(stockNo);
    setHistory(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/stock/${encodeURIComponent(stockNo)}`);
      const data = await res.json();
      setHistory(data.history || []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <input
        className="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search a stock number or type…"
      />

      {filtered.length === 0 ? (
        <p className="empty-state">No stock numbers match.</p>
      ) : (
        <table className="history">
          <thead>
            <tr>
              <th>Stock No.</th>
              <th>Type</th>
              <th>Where it stands</th>
              <th>Last memo</th>
              <th className="num">Times out</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <>
                <tr key={r.stockNo} onClick={() => show(r.stockNo)}>
                  <td className="memono">{r.stockNo}</td>
                  <td>{r.type || "—"}</td>
                  <td><span className={`out-tag ${r.current || "open"}`}>{outcomeLabel(r.current)}</span></td>
                  <td>{r.lastMemoNo} · {formatDate(r.lastDate)}</td>
                  <td className="num">{r.memos}</td>
                </tr>
                {open === r.stockNo && (
                  <tr key={`${r.stockNo}-h`} className="ledger-row">
                    <td colSpan={5}>
                      {loading ? (
                        <p className="auth-muted">Loading…</p>
                      ) : !history?.length ? (
                        <p className="auth-muted">No movements recorded.</p>
                      ) : (
                        <ol className="ledger">
                          {history.map((h, i) => (
                            <li key={i}>
                              <span className="lg-date">{formatDate(h.date)}</span>
                              <span className="lg-body">
                                Issued on <Link href={`/memo/${h.memoId}`}>{h.memoNo}</Link>
                                {h.to && <> to <strong>{h.to}</strong></>}
                                {" — "}
                                <span className={`out-tag ${h.outcome || "open"}`}>{outcomeLabel(h.outcome)}</span>
                                {h.event && (
                                  <span className="ev-meta">
                                    on {formatDate(eventDate(h.event))} · recorded by {h.event.by}
                                    {eventDate(h.event) !== h.event.at.slice(0, 10) && (
                                      <> (keyed in {new Date(h.event.at).toLocaleDateString()})</>
                                    )}
                                    {h.event.replacedBy && <> · replaced by {h.event.replacedBy}</>}
                                    {h.event.note && <> · {h.event.note}</>}
                                  </span>
                                )}
                              </span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

"use client";
import { useMemo, useState } from "react";
import type { StockRow } from "@/lib/stockSheet";

const STATE_LABEL: Record<string, string> = {
  available: "Available",
  reserved: "Not issuable",
  unusable: "Not issuable",
};

export default function SheetClient({ rows }: { rows: StockRow[] }) {
  const [q, setQ] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toUpperCase();
    return rows.filter((r) => {
      if (onlyAvailable && r.state !== "available") return false;
      if (!needle) return true;
      return r.stockNo.includes(needle) || r.location.toUpperCase().includes(needle);
    });
  }, [q, rows, onlyAvailable]);

  return (
    <>
      <div className="sheet-controls">
        <input
          className="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a stock number or location…"
        />
        <label className="sheet-toggle">
          <input
            type="checkbox"
            checked={onlyAvailable}
            onChange={(e) => setOnlyAvailable(e.target.checked)}
          />
          <span>Only pieces I can memo</span>
        </label>
      </div>

      <p className="auth-muted">{filtered.length.toLocaleString()} shown</p>

      <table className="history">
        <thead>
          <tr><th>Stock No.</th><th>Location</th><th>Status</th></tr>
        </thead>
        <tbody>
          {filtered.slice(0, 500).map((r) => (
            <tr key={r.stockNo}>
              <td className="memono">{r.stockNo}</td>
              <td>{r.location || <span className="auth-muted">— blank —</span>}</td>
              <td>
                <span className={`out-tag ${r.state === "available" ? "returned" : "open"}`}>
                  {STATE_LABEL[r.state] || "Not issuable"}
                </span>
                {r.state !== "available" && <div className="ev-meta">{r.reason}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length > 500 && (
        <p className="auth-muted">Showing the first 500 — narrow the search to see the rest.</p>
      )}
    </>
  );
}

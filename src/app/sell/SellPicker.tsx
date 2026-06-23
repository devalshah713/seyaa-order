"use client";

import { useMemo, useState } from "react";

export type SellStock = {
  stockNo: string;
  date: string;
  designNumber: string;
  designName: string;
  manufacturerName: string;
  totalDiaPcs: string;
  totalDiamondWeight: string;
};

// Pick stock pieces to "sell" and download the sell sheet for the diamond team.
export default function SellPicker({ stocks }: { stocks: SellStock[] }) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return stocks;
    return stocks.filter(
      (s) =>
        s.stockNo.toLowerCase().includes(needle) ||
        s.designNumber.toLowerCase().includes(needle) ||
        s.designName.toLowerCase().includes(needle) ||
        s.manufacturerName.toLowerCase().includes(needle)
    );
  }, [stocks, q]);

  const selectedNos = Object.keys(selected).filter((k) => selected[k]);
  const allFilteredSelected = filtered.length > 0 && filtered.every((s) => selected[s.stockNo]);

  function toggle(no: string) {
    setSelected((prev) => ({ ...prev, [no]: !prev[no] }));
  }
  function toggleAll() {
    setSelected((prev) => {
      const next = { ...prev };
      const target = !allFilteredSelected;
      for (const s of filtered) next[s.stockNo] = target;
      return next;
    });
  }

  function exportSheet() {
    const qs = selectedNos.map((n) => `stock=${encodeURIComponent(n)}`).join("&");
    window.location.href = `/api/sell/export?${qs}`;
  }

  if (stocks.length === 0) {
    return <div className="card empty">No stock recorded yet — record stock in first.</div>;
  }

  return (
    <>
      <div className="row spread no-print" style={{ marginBottom: 12, gap: 8 }}>
        <input
          placeholder="Search stock #, design, maker…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <div className="row" style={{ gap: 8 }}>
          <span className="muted" style={{ alignSelf: "center", fontSize: 13 }}>
            {selectedNos.length} selected
          </span>
          <button className="btn gold" type="button" disabled={!selectedNos.length} onClick={exportSheet}>
            Export Sell Sheet
          </button>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style={{ width: 36 }}>
              <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} aria-label="Select all" />
            </th>
            <th>Stock #</th>
            <th>Date</th>
            <th>Design #</th>
            <th>Design Name</th>
            <th>Maker</th>
            <th>Dia Pcs</th>
            <th>Dia Wt</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((s) => (
            <tr key={s.stockNo} style={selected[s.stockNo] ? { background: "var(--gold-soft)" } : undefined}>
              <td>
                <input type="checkbox" checked={!!selected[s.stockNo]} onChange={() => toggle(s.stockNo)} aria-label={`Select stock ${s.stockNo}`} />
              </td>
              <td style={{ fontWeight: 700 }}>{s.stockNo}</td>
              <td className="muted" style={{ whiteSpace: "nowrap" }}>{s.date || "—"}</td>
              <td>{s.designNumber || "—"}</td>
              <td>{s.designName || "—"}</td>
              <td className="muted">{s.manufacturerName || "—"}</td>
              <td className="muted">{s.totalDiaPcs || "—"}</td>
              <td className="muted">{s.totalDiamondWeight || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

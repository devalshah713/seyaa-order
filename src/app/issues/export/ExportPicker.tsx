"use client";

import { useMemo, useState } from "react";

type DesignSummary = { designNumber: string; memos: number; lines: number };

export default function ExportPicker({ designs }: { designs: DesignSummary[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return designs;
    return designs.filter((d) => d.designNumber.toLowerCase().includes(q));
  }, [designs, query]);

  function toggle(design: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(design)) next.delete(design);
      else next.add(design);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      filtered.forEach((d) => next.add(d.designNumber));
      return next;
    });
  }

  function clearAll() {
    setSelected(new Set());
  }

  const selectedLines = designs
    .filter((d) => selected.has(d.designNumber))
    .reduce((sum, d) => sum + d.lines, 0);

  async function exportNow() {
    if (!selected.size) return;
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch("/api/issues/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designNumbers: Array.from(selected) }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Export failed.");
      }
      const blob = await res.blob();
      // Pull the filename the server set, fall back to a sensible default.
      const cd = res.headers.get("content-disposition") || "";
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : "Diamond Issue to Manufacturer.xlsx";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setDownloading(false);
    }
  }

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((d) => selected.has(d.designNumber));

  return (
    <>
      {error && (
        <div className="card" style={{ borderColor: "#dc2626", color: "#dc2626", background: "#fef2f2" }}>
          {error}
        </div>
      )}

      <div className="card">
        <div className="row spread" style={{ marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <input
            placeholder="Search design number…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: "1 1 240px" }}
          />
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn ghost small" onClick={selectAllFiltered}>
              {query ? "Select all matching" : "Select all"}
            </button>
            <button type="button" className="btn ghost small" onClick={clearAll}>
              Clear
            </button>
          </div>
        </div>

        <div style={{ maxHeight: 420, overflowY: "auto", border: "1px solid var(--line, #e5e7eb)", borderRadius: 8 }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={() => (allFilteredSelected ? clearAll() : selectAllFiltered())}
                    aria-label="Select all"
                  />
                </th>
                <th>Design Number</th>
                <th>Memos</th>
                <th>Diamond lines</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr
                  key={d.designNumber}
                  onClick={() => toggle(d.designNumber)}
                  style={{ cursor: "pointer", background: selected.has(d.designNumber) ? "var(--gold-soft, #fdf6e3)" : undefined }}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(d.designNumber)}
                      onChange={() => toggle(d.designNumber)}
                    />
                  </td>
                  <td style={{ fontWeight: 600 }}>{d.designNumber}</td>
                  <td className="muted">{d.memos}</td>
                  <td className="muted">{d.lines}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted" style={{ textAlign: "center", padding: 16 }}>
                    No designs match “{query}”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="row spread" style={{ marginTop: 12, alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <span className="muted">
          {selected.size} design{selected.size === 1 ? "" : "s"} selected · {selectedLines} diamond line
          {selectedLines === 1 ? "" : "s"}
        </span>
        <button className="btn gold" type="button" onClick={exportNow} disabled={!selected.size || downloading}>
          {downloading ? "Preparing…" : `Export Excel (${selected.size})`}
        </button>
      </div>
    </>
  );
}

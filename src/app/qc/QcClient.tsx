"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/lib/memoFormat";
import { matchDesign } from "@/lib/designNo";
import { RESULT_LABEL, answerLabel, type QcLine } from "@/lib/qcConfig";
import type { QcRow } from "@/lib/qcStore";

// What has been checked, and how it went. The verdict is what anyone opening
// this is looking for, so it leads every row.
//
// This is a client component, so every field it is given is written into the
// page the server sends. It is therefore given rows rather than whole QC
// records (see QcRow), and in particular it is not given each record's fifteen
// checks, which are most of a record and are hidden until somebody opens the
// row. The verdict and the names of the failed checks come worked out on the
// row, so nothing here rebuilds them from the lines.
export default function QcClient({
  records,
  initialQuery,
}: {
  records: QcRow[];
  initialQuery: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(records);
  const [q, setQ] = useState(initialQuery);
  const [only, setOnly] = useState<"all" | "pass" | "fail">("all");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  // The checks of the records somebody has opened, fetched one record at a
  // time and kept for as long as the screen is up, so opening a row twice asks
  // once. A record with no checks at all stores an empty list, which is an
  // answer and must not read as "not fetched yet".
  const [lines, setLines] = useState<Record<string, QcLine[]>>({});
  const [lineError, setLineError] = useState<Record<string, string>>({});

  async function loadLines(id: string) {
    try {
      const res = await fetch(`/api/qc/${id}`);
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || "Could not read the checks.");
      setLines((prev) => ({ ...prev, [id]: d?.lines || [] }));
    } catch (err) {
      setLineError((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : "Could not read the checks.",
      }));
    }
  }

  const toggle = (id: string) => {
    const opening = !open.has(id);
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
    // Only on the way open, and only if the checks are not already here: a row
    // that failed to load once can be asked for again by opening it again.
    if (opening && !lines[id]) {
      setLineError((prev) => (prev[id] ? { ...prev, [id]: "" } : prev));
      void loadLines(id);
    }
  };

  const shown = useMemo(() => {
    const needle = q.trim();
    const lower = needle.toLowerCase();
    return rows.filter((r) => {
      if (only !== "all" && r.result !== only) return false;
      if (!needle) return true;
      if (r.designNo && matchDesign(r.designNo, needle)) return true;
      return [r.qcNo, r.stockNo, r.design, r.category, r.checkedBy, r.comments]
        .join(" ").toLowerCase().includes(lower);
    });
  }, [rows, q, only]);

  const counts = useMemo(() => {
    let pass = 0, fail = 0, open2 = 0;
    for (const r of rows) {
      if (r.result === "pass") pass++; else if (r.result === "fail") fail++; else open2++;
    }
    return { pass, fail, open: open2 };
  }, [rows]);

  async function del(r: QcRow) {
    if (!window.confirm(`Delete QC ${r.qcNo} for ${r.stockNo}?`)) return;
    setError("");
    try {
      const res = await fetch(`/api/qc/${r.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error || "Could not delete.");
      }
      setRows((list) => list.filter((x) => x.id !== r.id));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
    }
  }

  return (
    <>
      <div className="jg-bar">
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Stock number, design number, category or checker" />
        <a href="/api/qc/export" className="btn">Export to Excel</a>
        <Link href="/qc/new" className="btn btn-primary">+ Check a piece</Link>
      </div>

      <div className="kind-tabs">
        <button className={only === "all" ? "active" : ""} onClick={() => setOnly("all")}>
          All ({rows.length})
        </button>
        <button className={only === "fail" ? "active" : ""} onClick={() => setOnly("fail")}>
          Failed ({counts.fail})
        </button>
        <button className={only === "pass" ? "active" : ""} onClick={() => setOnly("pass")}>
          Passed ({counts.pass})
        </button>
      </div>

      {error && <p className="save-error" style={{ marginTop: 0 }}>{error}</p>}

      {shown.length === 0 ? (
        <div className="empty-state">
          <p>
            {rows.length === 0
              ? "Nothing checked yet. QC follows stock-in — pick a piece that is already in stock."
              : "No QC record matches that."}
          </p>
          {rows.length === 0 && (
            <Link href="/qc/new" className="btn btn-primary">Check a piece</Link>
          )}
        </div>
      ) : (
        <div className="jg-scroll">
          <table className="jg-table sb-table">
            <thead>
              <tr>
                <th>Result</th><th>QC No.</th><th>Stock No.</th>
                <th>Design Number</th><th>Category</th>
                <th>QC Date</th><th>Checked By</th><th>Failed on</th>
                <th className="jg-sr" />
              </tr>
            </thead>
            <tbody>
              {shown.flatMap((r) => {
                const result = r.result;
                const failed = r.failed;
                const isOpen = open.has(r.id);
                const checks = lines[r.id];
                return [
                  <tr key={r.id} className={isOpen ? "sb-open" : undefined}>
                    <td data-label="Result">
                      <button type="button" className={`qc-badge ${result}`}
                        onClick={() => toggle(r.id)} aria-expanded={isOpen}>
                        {RESULT_LABEL[result]} {isOpen ? "▴" : "▾"}
                      </button>
                    </td>
                    <td data-label="QC No."><span className="sb-link">{r.qcNo}</span></td>
                    <td data-label="Stock No."><b>{r.stockNo}</b></td>
                    <td data-label="Design Number">{r.designNo || "—"}</td>
                    <td data-label="Category">{r.category || "—"}</td>
                    <td data-label="QC Date">{r.date ? formatDate(r.date) : "—"}</td>
                    <td data-label="Checked By">{r.checkedBy || "—"}</td>
                    <td data-label="Failed on" className="sb-wide">
                      {failed.length ? failed.join(", ") : "—"}
                    </td>
                    <td className="jg-sr">
                      <button className="del" onClick={() => del(r)}
                        title="Delete this QC" aria-label="Delete this QC">×</button>
                    </td>
                  </tr>,
                  ...(isOpen ? [
                    <tr key={`${r.id}-detail`} className="sb-breakup">
                      <td colSpan={9}>
                        <div className="sb-breakup-in">
                          <h4>{r.qcNo} · {r.stockNo} · {r.lineCount} checks</h4>
                          {/* The checks are fetched when the row is opened, so
                              there is a moment before they are here, and a
                              fetch that fails says so rather than showing an
                              empty sheet. */}
                          {lineError[r.id] ? (
                            <p className="save-error">{lineError[r.id]}</p>
                          ) : !checks ? (
                            <p className="pieces-hint">Loading the checks…</p>
                          ) : (
                            <table className="sb-sub qc-sub">
                              <thead><tr><th>Check</th><th>Answer</th><th>Remark</th></tr></thead>
                              <tbody>
                                {checks.map((l, i) => (
                                  <tr key={i} className={l.answer === "no" ? "bad" : ""}>
                                    <td>{l.check}</td>
                                    <td className={`ans ${l.answer}`}>{answerLabel(l.answer) || "—"}</td>
                                    <td>{l.remark || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          {r.comments && <p className="pieces-hint">{r.comments}</p>}
                        </div>
                      </td>
                    </tr>,
                  ] : []),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <div className="jg-foot">
          <span>{shown.length} of {rows.length} records</span>
          <span>Passed <b>{counts.pass}</b></span>
          <span>Failed <b>{counts.fail}</b></span>
          {counts.open > 0 && <span>In progress <b>{counts.open}</b></span>}
        </div>
      )}
    </>
  );
}

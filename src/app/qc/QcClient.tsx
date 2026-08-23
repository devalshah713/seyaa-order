"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/lib/memoFormat";
import { matchDesign } from "@/lib/designNo";
import {
  RESULT_LABEL, answerLabel, failedChecks, qcResult, type QcRecord,
} from "@/lib/qcConfig";

// What has been checked, and how it went. The verdict is what anyone opening
// this is looking for, so it leads every row.
export default function QcClient({
  records,
  initialQuery,
}: {
  records: QcRecord[];
  initialQuery: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(records);
  const [q, setQ] = useState(initialQuery);
  const [only, setOnly] = useState<"all" | "pass" | "fail">("all");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const shown = useMemo(() => {
    const needle = q.trim();
    const lower = needle.toLowerCase();
    return rows.filter((r) => {
      const result = qcResult(r.lines);
      if (only !== "all" && result !== only) return false;
      if (!needle) return true;
      if (r.designNo && matchDesign(r.designNo, needle)) return true;
      return [r.qcNo, r.stockNo, r.design, r.category, r.checkedBy, r.comments]
        .join(" ").toLowerCase().includes(lower);
    });
  }, [rows, q, only]);

  const counts = useMemo(() => {
    let pass = 0, fail = 0, open2 = 0;
    for (const r of rows) {
      const v = qcResult(r.lines);
      if (v === "pass") pass++; else if (v === "fail") fail++; else open2++;
    }
    return { pass, fail, open: open2 };
  }, [rows]);

  async function del(r: QcRecord) {
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
                const result = qcResult(r.lines);
                const failed = failedChecks(r.lines);
                const isOpen = open.has(r.id);
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
                      {failed.length ? failed.map((f) => f.check).join(", ") : "—"}
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
                          <h4>{r.qcNo} · {r.stockNo} · {r.lines.length} checks</h4>
                          <table className="sb-sub qc-sub">
                            <thead><tr><th>Check</th><th>Answer</th><th>Remark</th></tr></thead>
                            <tbody>
                              {r.lines.map((l, i) => (
                                <tr key={i} className={l.answer === "no" ? "bad" : ""}>
                                  <td>{l.check}</td>
                                  <td className={`ans ${l.answer}`}>{answerLabel(l.answer) || "—"}</td>
                                  <td>{l.remark || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
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

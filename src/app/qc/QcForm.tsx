"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { todayInput } from "@/lib/memoFormat";
import {
  ANSWERS, RESULT_LABEL, answeredCount, failedChecks, qcResult,
  type QcAnswer, type QcLine,
} from "@/lib/qcConfig";
import type { QcSeed } from "@/lib/qcStore";

// Checking a finished piece over.
//
// It starts from a stock number, because a piece that was never taken in has
// nothing to be checked — and everything about it is already recorded, so the
// checker only answers the questions.

export default function QcForm({
  pieces,
  who,
}: {
  pieces: QcSeed[];
  who: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [piece, setPiece] = useState<QcSeed | null>(null);
  const [date, setDate] = useState(todayInput());
  const [checkedBy, setCheckedBy] = useState(who);
  const [lines, setLines] = useState<QcLine[]>([]);
  const [comments, setComments] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pieces.slice(0, 40);
    return pieces
      .filter((p) =>
        [p.stockNo, p.designNo, p.design, p.category, p.manufacturer]
          .join(" ").toLowerCase().includes(q)
      )
      .slice(0, 40);
  }, [pieces, query]);

  function take(p: QcSeed) {
    setPiece(p);
    setError("");
    setLines(p.checks.map((check) => ({ check, answer: "" as QcAnswer, remark: "" })));
  }

  const setLine = (i: number, patch: Partial<QcLine>) =>
    setLines((list) => list.map((l, n) => (n === i ? { ...l, ...patch } : l)));

  // Everything not yet answered set to yes in one go — a checker works down the
  // list marking what is wrong, and most pieces are mostly right.
  const passRest = () =>
    setLines((list) => list.map((l) => (l.answer ? l : { ...l, answer: "yes" })));

  const result = qcResult(lines);
  const { done, total } = answeredCount(lines);
  const failed = failedChecks(lines);

  async function save() {
    if (!piece) return;
    if (done < total) {
      setError(`${total - done} check${total - done === 1 ? "" : "s"} still unanswered.`);
      return;
    }
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/qc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...piece, date, checkedBy, lines, comments,
          stockId: piece.stockId,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Could not save (${res.status}).`);
      router.push(`/qc?q=${encodeURIComponent(piece.stockNo)}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the QC.");
      setSaving(false);
    }
  }

  return (
    <>
      {!piece && (
        <section className="qc-pick">
          <div className="sb-pick-head"><span>Pieces in stock</span></div>
          <input
            className="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Stock number, design number or category"
          />
          {pieces.length === 0 ? (
            <p className="pieces-hint">
              Nothing in stock yet. QC follows stock-in — take a piece into the
              Stock Book first.
            </p>
          ) : shown.length === 0 ? (
            <p className="pieces-hint">No piece in stock matches that.</p>
          ) : (
            <div className="qc-piece-list">
              {shown.map((p) => (
                <button key={p.stockId} type="button" className="qc-piece"
                  onClick={() => take(p)}>
                  <b>{p.stockNo}</b>
                  <small>{[p.designNo, p.category].filter(Boolean).join(" · ") || "—"}</small>
                  <small className={p.checks.length ? "" : "warn"}>
                    {p.checks.length
                      ? `${p.checks.length} checks`
                      : "no checks for this category"}
                    {p.done > 0 && ` · checked ${p.done}×`}
                  </small>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {piece && (
        <>
          <section className="qc-piece-head">
            <div className="sb-pick-head">
              <span>Checking</span>
              <button type="button" className="linkbtn" onClick={() => setPiece(null)}>
                Pick a different piece
              </button>
            </div>
            <h2>{piece.stockNo}</h2>
            <dl className="qc-facts">
              {([
                ["Design", piece.design], ["Design number", piece.designNo],
                ["Category", piece.category], ["Gold", piece.goldDetails],
                ["Location", piece.location], ["Inch / size", piece.inchSize],
                ["Gross", piece.grossWt], ["Net", piece.netWt],
                ["Diamond wt", piece.totalDiaWt], ["Dia pcs", piece.totalDiaPcs],
                ["Manufacturer", piece.manufacturer],
              ] as [string, string][]).filter(([, v]) => v).map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
            {piece.done > 0 && (
              <p className="pieces-hint">
                This piece has been through QC {piece.done} time
                {piece.done === 1 ? "" : "s"} already. Saving adds another record
                rather than replacing them.
              </p>
            )}
            <div className="two">
              <label className="field"><span>QC date</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
              <label className="field"><span>Checked by</span>
                <input value={checkedBy} onChange={(e) => setCheckedBy(e.target.value)} /></label>
            </div>
          </section>

          {lines.length === 0 ? (
            <div className="notice">
              <b>{piece.category || "This category"}</b> has no QC checks yet. An
              admin adds them under <Link href="/admin/parties">Lists → QC checks</Link>,
              choosing this category.
            </div>
          ) : (
            <section className="qc-checks">
              <div className="sb-pick-head">
                <span>{piece.category} — {total} checks</span>
                <span className="jg-muted">{done} of {total} answered</span>
                {done < total && (
                  <button type="button" className="linkbtn" onClick={passRest}>
                    Mark the rest Yes
                  </button>
                )}
              </div>
              <ol className="qc-list">
                {lines.map((l, i) => (
                  <li key={l.check} className={l.answer === "no" ? "bad" : l.answer === "na" ? "na" : ""}>
                    <div className="qc-check-name">{l.check}</div>
                    <div className="qc-answers" role="group" aria-label={l.check}>
                      {ANSWERS.map((a) => (
                        <button
                          key={a.value}
                          type="button"
                          className={`qc-ans ${a.value} ${l.answer === a.value ? "on" : ""}`}
                          aria-pressed={l.answer === a.value}
                          onClick={() => setLine(i, { answer: l.answer === a.value ? "" : a.value })}
                        >
                          {a.short}
                        </button>
                      ))}
                    </div>
                    <input
                      className="qc-remark"
                      value={l.remark}
                      onChange={(e) => setLine(i, { remark: e.target.value })}
                      placeholder={l.answer === "no" ? "What is wrong?" : "Remark"}
                    />
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className={`qc-verdict ${result}`}>
            <div>
              <span className="qc-verdict-label">Result</span>
              <b>{RESULT_LABEL[result]}</b>
            </div>
            {result === "fail" && (
              <p>
                Failed on {failed.map((f) => f.check).join(", ")}.
              </p>
            )}
            {result === "open" && (
              <p>{total - done} check{total - done === 1 ? "" : "s"} left to answer.</p>
            )}
            {result === "pass" && <p>Every check answered, nothing failed.</p>}
          </section>

          <label className="field"><span>Comments</span>
            <textarea rows={2} value={comments}
              onChange={(e) => setComments(e.target.value)} /></label>

          {error && <p className="save-error">{error}</p>}

          <div className="pieces-actions">
            <button className="btn btn-primary" onClick={save}
              disabled={saving || !lines.length}>
              {saving ? "Saving…" : `Save QC — ${RESULT_LABEL[result]}`}
            </button>
            <Link href="/qc" className="btn">Cancel</Link>
          </div>
        </>
      )}
    </>
  );
}

"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Combo from "@/components/Combo";
import { formatDate, todayInput } from "@/lib/memoFormat";
import { splitPiece } from "@/lib/designNo";
import {
  BLANK_JANGAD, SETTINGS, columnsFor, isMergedColumn, linesForPiece, mergeSpans,
  type JangadField,
} from "@/lib/jangadConfig";
import type { JangadSeed } from "@/lib/jangadStore";

type Draft = Record<JangadField, string>;

// Stage one of the register: diamonds going out against a design.
//
// The design number is the way in. Everything the PD sheet and its demand
// already know — product, shapes, sizes, stones, carats, CVD/HPHT — is fetched
// rather than retyped; the accountant adds only what is theirs: the setting,
// the certificate, the rate and the memo it went out on.
export default function NewJangadForm() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [seed, setSeed] = useState<JangadSeed | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<Draft[]>([]);
  const [date, setDate] = useState(todayInput());
  const [memoNo, setMemoNo] = useState("");
  const [mfg, setMfg] = useState("");
  const [looking, setLooking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const issueCols = columnsFor("issue");

  async function lookup() {
    const q = query.trim();
    if (!q) return;
    setError("");
    setLooking(true);
    try {
      const res = await fetch(`/api/jangad?design=${encodeURIComponent(q)}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Could not look that up (${res.status}).`);
      const s: JangadSeed = data.seed;
      setSeed(s);
      setMfg(s.assignedTo);
      const start = new Set(s.pieces.filter((p) => p.suggested).map((p) => p.no));
      setPicked(start);
      setRows(build(s, start, date, memoNo, s.assignedTo));
    } catch (err) {
      setSeed(null);
      setRows([]);
      setError(err instanceof Error ? err.message : "Could not look that up.");
    } finally {
      setLooking(false);
    }
  }

  // One entry per stone size per piece, which is how the workbook is written —
  // but only the sizes that piece actually takes. Which those are is on the PD
  // sheet, per size: blank means every piece, and a size that names a piece
  // goes only into that one. See linesForPiece.
  //
  // Issuing splits the run: only some of the five pieces get diamonds now, so
  // the design and the piece go in separate columns — "SN-BR-AMF-10CT" and
  // "63" — rather than repeating the whole run on every line.
  function build(s: JangadSeed, pieces: Set<string>, d: string, memo: string, mfgName: string): Draft[] {
    const out: Draft[] = [];
    const run = s.pieces.map((x) => splitPiece(x.no).sub).filter(Boolean);
    for (const p of s.pieces) {
      if (!pieces.has(p.no)) continue;
      const { design, sub } = splitPiece(p.no);
      const base = {
        ...BLANK_JANGAD,
        date: d,
        designNo: design,
        subDesignNo: sub,
        product: s.product,
        memoNo: memo,
        mfgName,
        stockCode: p.stockNo,
        status: "Issued",
      };
      const mine = linesForPiece(s.lines, sub, run);
      for (const l of mine) {
        // Diamond Carats stays empty on purpose — the bag is weighed.
        out.push({ ...base, shape: l.shape, size: l.size, pcs: l.pcs, growth: l.growth });
      }
      // A design with no diamond sizes on its PD sheet still gets a line, so
      // the entry can be made by hand rather than not at all.
      if (!mine.length) out.push(base);
    }
    return out;
  }

  const togglePiece = (no: string) => {
    if (!seed) return;
    const next = new Set(picked);
    if (next.has(no)) next.delete(no);
    else next.add(no);
    setPicked(next);
    setRows(build(seed, next, date, memoNo, mfg));
  };

  const allPieces = () => {
    if (!seed) return;
    const next = new Set(
      picked.size === seed.pieces.length ? [] : seed.pieces.map((p) => p.no)
    );
    setPicked(next);
    setRows(build(seed, next, date, memoNo, mfg));
  };

  // Date and Memo No. are the same for the whole issue, so they are set once
  // above and pushed into every row rather than typed twenty times.
  const setDateAll = (v: string) => {
    setDate(v);
    setRows((list) => list.map((r) => ({ ...r, date: v })));
  };
  const setMemoAll = (v: string) => {
    setMemoNo(v);
    setRows((list) => list.map((r) => ({ ...r, memoNo: v })));
  };

  // A merged cell is one box standing for the rows beneath it, so writing in
  // it writes to all of them.
  const setCell = (from: number, span: number, k: JangadField, v: string) =>
    setRows((list) =>
      list.map((r, n) => (n >= from && n < from + span ? { ...r, [k]: v } : r))
    );

  const spans = useMemo(() => mergeSpans(rows), [rows]);

  // Whether the sheet names a piece against any of its sizes — worth saying,
  // because it is the difference between two entries and four.
  const perPiece = (seed?.lines || []).some((l) => (l.pieces || "").trim());

  // Picking a piece the register already covers is allowed — a second bag for
  // the same piece is a real thing — but it is never silent.
  const reissuing = (seed?.pieces || [])
    .filter((p) => p.issued && picked.has(p.no))
    .map((p) => p.no);

  // Mfg Name comes off the PD sheet, but the whole issue goes to one factory,
  // so changing it changes every row rather than being retyped down the column.
  const setMfgAll = (v: string) => {
    setMfg(v);
    setRows((list) => list.map((r) => ({ ...r, mfgName: v })));
  };

  async function save() {
    if (!rows.length) {
      setError("Pick at least one piece first.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/jangad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows,
          pdId: seed?.pdId, pdNo: seed?.pdNo, demandNo: seed?.demandNo,
          runNo: seed?.designNo,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Could not save (${res.status}).`);
      router.push(`/jangad?q=${encodeURIComponent(seed?.designNo || "")}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the entries.");
      setSaving(false);
    }
  }

  return (
    <>
      <div className="jg-lookup">
        <label className="field">
          <span>Design number</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void lookup(); }}
            placeholder="SN-BR-AMF-41-49 or a single piece, SN-BR-AMF-46"
          />
        </label>
        <button className="btn btn-primary" onClick={lookup} disabled={looking}>
          {looking ? "Looking…" : "Fetch design"}
        </button>
        <p className="pieces-hint">
          Everything on the PD sheet and its demand is pulled in. Type the whole
          run, or one piece if that is all the packet says.
        </p>
      </div>
      {error && <p className="save-error">{error}</p>}

      {seed && (
        <>
          <section className="jg-found">
            <div className="jg-found-head">
              <h2>{seed.designNo}</h2>
              <span className="jg-tag">{seed.pdNo}</span>
              {seed.demandNo && <span className="jg-tag">{seed.demandNo}</span>}
              {seed.product && <span className="jg-muted">{seed.product}</span>}
            </div>

            <div className="two">
              <label className="field"><span>Date</span>
                <input type="date" value={date} onChange={(e) => setDateAll(e.target.value)} /></label>
              <label className="field"><span>Memo No.</span>
                <input value={memoNo} onChange={(e) => setMemoAll(e.target.value)}
                  placeholder="SS/26-27/014" /></label>
            </div>
            <label className="field"><span>Mfg Name — who it goes to</span>
              <input value={mfg} onChange={(e) => setMfgAll(e.target.value)}
                placeholder="PRATIK C6" /></label>
            {seed.assignedTo && (
              <p className="pieces-hint">
                Taken from the PD sheet, which has this design assigned to{" "}
                <b>{seed.assignedTo}</b>.
              </p>
            )}

            <div className="jg-pieces">
              <div className="jg-pieces-head">
                <span>Pieces receiving diamonds</span>
                <button type="button" className="linkbtn" onClick={allPieces}>
                  {picked.size === seed.pieces.length ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className="jg-piece-list">
                {seed.pieces.map((p) => (
                  <label
                    key={p.no}
                    className={[
                      "jg-piece",
                      picked.has(p.no) ? "on" : "",
                      p.issued ? "done" : "",
                    ].filter(Boolean).join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={picked.has(p.no)}
                      onChange={() => togglePiece(p.no)}
                    />
                    <b>{p.no}</b>
                    {/* What the register already holds beats what the PD sheet
                        says: a piece whose diamonds went out last week must not
                        read as if it is still waiting for them. */}
                    <small>
                      {p.issued
                        ? `issued ${p.issued.date ? formatDate(p.issued.date) : ""}${
                            p.issued.memoNo ? ` · ${p.issued.memoNo}` : ""
                          }`
                        : p.stockNo ? `stock ${p.stockNo}` : p.status}
                    </small>
                  </label>
                ))}
              </div>
              <p className="pieces-hint">
                {!seed.lines.length
                  ? "This design has no diamond sizes on its PD sheet, so the sizes are yours to fill in."
                  : `${seed.lines.length} diamond ${seed.lines.length === 1 ? "size" : "sizes"} on this design${perPiece ? ", drawn one to a piece" : ""} — ${rows.length} ${rows.length === 1 ? "entry" : "entries"} in all.`}
              </p>
              {reissuing.length > 0 && (
                <p className="hint warn">
                  {reissuing.length === 1
                    ? `${reissuing[0]} has already had diamonds issued.`
                    : `${reissuing.length} of these have already had diamonds issued.`}{" "}
                  Saving adds a second issue against{" "}
                  {reissuing.length === 1 ? "it" : "them"} rather than replacing
                  the first — right for a top-up, not for a correction.
                </p>
              )}
            </div>
          </section>

          {rows.length > 0 && (
            <>
              <div className="jg-scroll">
                <table className="jg-table">
                  <thead>
                    <tr>
                      <th className="jg-sr">#</th>
                      {issueCols.map((c) => <th key={c.key}>{c.header}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td className="jg-sr">{i + 1}</td>
                        {issueCols.map((c) => {
                          const span = isMergedColumn(c.key) ? spans.get(c.key)?.get(i) : 1;
                          // No entry means a run above already covers this row.
                          if (span === undefined) return null;
                          const fixed = c.key === "designNo" || c.key === "subDesignNo";
                          return (
                            <td
                              key={c.key}
                              data-label={c.header}
                              rowSpan={span > 1 ? span : undefined}
                              className={span > 1 ? "merged" : undefined}
                            >
                              {c.key === "setting" ? (
                                <Combo value={r.setting}
                                  onChange={(v) => setCell(i, span, "setting", v)}
                                  options={SETTINGS} placeholder="Prong" />
                              ) : (
                                <input
                                  type={c.kind === "date" ? "date" : "text"}
                                  inputMode={c.kind === "number" ? "decimal" : undefined}
                                  value={r[c.key]}
                                  onChange={(e) => setCell(i, span, c.key, e.target.value)}
                                  readOnly={fixed}
                                  className={fixed ? "jg-fixed" : ""}
                                />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pieces-actions">
                <button className="btn btn-primary" onClick={save} disabled={saving}>
                  {saving ? "Saving…" : `Save ${rows.length} ${rows.length === 1 ? "entry" : "entries"}`}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Combo from "@/components/Combo";
import { formatDate, todayInput } from "@/lib/memoFormat";
import { splitPiece } from "@/lib/designNo";
import {
  BLANK_JANGAD, JANGAD_COLUMNS, SETTINGS, columnsFor, isMergedColumn,
  linesForPiece, mergeSpans, type JangadField,
} from "@/lib/jangadConfig";
import type { JangadSeed } from "@/lib/jangadStore";

// `manual` marks a line the accountant added by hand rather than one the PD
// sheet asked for. It is only ever local — the register stores the row like any
// other — but while the form is open it keeps the line from being swept away
// when the rows are rebuilt, and shows which lines are the extra ones.
type Draft = Record<JangadField, string> & { manual?: boolean };

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

  // Comments belongs to the return stage on the workbook, so the issue screen
  // does not normally show it. An add-on is the exception: why the stones are
  // going out is the whole point of the entry, and it has to be written at the
  // moment they go, not looked back for weeks later.
  const commentsCol = JANGAD_COLUMNS.find((c) => c.key === "comments")!;

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
      setRemoved(new Set());
      setRows(build(s, start, date, memoNo, s.assignedTo, addOn));
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
  function build(
    s: JangadSeed, pieces: Set<string>, d: string, memo: string, mfgName: string,
    isAddOn: boolean
  ): Draft[] {
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
        addOn: isAddOn ? "Add-on" : "",
      };
      // An add-on is not what the PD sheet asked for — that already went out —
      // so the piece starts with one empty line to write the replacement on.
      if (isAddOn) { out.push(base); continue; }
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

  // Rebuilding the rows must not throw away the lines somebody added by hand,
  // so each one is put back after the last line of the piece it belongs to —
  // where it has to sit, or the merged Design Number cell above it breaks in two.
  function withManual(fresh: Draft[], manual: Draft[]): Draft[] {
    if (!manual.length) return fresh;
    const out: Draft[] = [];
    fresh.forEach((row, i) => {
      out.push(row);
      const lastOfPiece = fresh[i + 1]?.subDesignNo !== row.subDesignNo;
      if (lastOfPiece) {
        out.push(...manual.filter((m) => m.subDesignNo === row.subDesignNo));
      }
    });
    return out;
  }

  // Lines taken off by hand, remembered so that ticking a piece off and back on
  // does not put them back.
  //
  // They are needed because the PD sheet cannot always be trusted to say which
  // piece takes which size. Left on "All pieces", two sizes across two pieces
  // come out as four entries when the design is really one size per piece —
  // and the accountant with the packet in front of them can see that, while
  // this screen cannot. Rather than have them wait on the PD sheet being
  // corrected, they take the two lines off here.
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  // An add-on issue: stones going out against a piece that already has its
  // diamonds, because one broke at the factory or came up short. It is not a
  // second reading of the PD sheet — the sheet's sizes already went out — so
  // the rows start empty and only what is actually going out is written.
  //
  // Deliberately a choice rather than something worked out from the piece
  // already having been issued: a design whose stones arrive a few bags at a
  // time is also a second issue, and that is not an add-on.
  const [addOn, setAddOn] = useState(false);

  // What identifies a line within its piece. Not the row index: rows move as
  // pieces are ticked on and off.
  const keyOf = (r: Draft) => [r.subDesignNo, r.shape, r.size, r.pcs].join("|");

  const assemble = (
    s: JangadSeed, pieces: Set<string>, manual: Draft[], off: Set<string>,
    isAddOn = addOn
  ) =>
    withManual(
      build(s, pieces, date, memoNo, mfg, isAddOn).filter((r) => !off.has(keyOf(r))),
      manual
    );

  // A piece that is no longer ticked takes its added lines with it.
  const rebuild = (s: JangadSeed, pieces: Set<string>, isAddOn = addOn) =>
    setRows((prev) => assemble(s, pieces, prev.filter((r) => r.manual), removed, isAddOn));

  // Switching in or out of add-on starts the rows over: what the PD sheet asks
  // for and what a replacement needs have nothing in common, so carrying the
  // old rows across would only leave the wrong ones to be deleted.
  const setMode = (on: boolean) => {
    setAddOn(on);
    if (!seed) return;
    setRemoved(new Set());
    // An add-on belongs to a piece whose diamonds already went out, so the
    // pieces that qualify are the opposite ones — nothing is pre-ticked either
    // way, because only the person holding the packet knows which piece it is.
    const start = on
      ? new Set<string>()
      : new Set(seed.pieces.filter((p) => p.suggested).map((p) => p.no));
    setPicked(start);
    setRows(build(seed, start, date, memoNo, mfg, on));
  };

  const togglePiece = (no: string) => {
    if (!seed) return;
    const next = new Set(picked);
    if (next.has(no)) next.delete(no);
    else next.add(no);
    setPicked(next);
    rebuild(seed, next);
  };

  const allPieces = () => {
    if (!seed) return;
    const next = new Set(
      picked.size === seed.pieces.length ? [] : seed.pieces.map((p) => p.no)
    );
    setPicked(next);
    rebuild(seed, next);
  };

  // One more diamond going out against a piece than the demand asked for —
  // two certified stones where the sheet said two stones, a replacement, a
  // second bag. The accountant adds the line here rather than sending the PD
  // sheet back to be changed.
  const addLine = (sub: string) => {
    setRows((list) => {
      const model = list.find((r) => r.subDesignNo === sub);
      const row: Draft = {
        ...BLANK_JANGAD,
        date,
        memoNo,
        mfgName: mfg,
        // The piece it belongs to, copied rather than typed — these are the
        // columns the register merges on, and they have to match exactly.
        designNo: model?.designNo || seed?.designNo || "",
        subDesignNo: sub,
        product: model?.product || seed?.product || "",
        stockCode: model?.stockCode || "",
        status: "Issued",
        addOn: addOn ? "Add-on" : "",
        manual: true,
      };
      let at = list.length - 1;
      list.forEach((r, i) => { if (r.subDesignNo === sub) at = i; });
      const out = list.slice();
      out.splice(at + 1, 0, row);
      return out;
    });
  };

  // Taking a line off. One added by hand simply goes; one the PD sheet asked
  // for is remembered as removed, so a rebuild does not bring it back.
  const dropLine = (at: number) =>
    setRows((list) => {
      const row = list[at];
      if (row && !row.manual) {
        setRemoved((prev) => new Set(prev).add(keyOf(row)));
      }
      return list.filter((_, i) => i !== at);
    });

  // Everything taken off, back again — for a wrong guess about which lines the
  // design really needs.
  const restoreLines = () => {
    if (!seed) return;
    const empty = new Set<string>();
    setRemoved(empty);
    setRows((prev) => assemble(seed, picked, prev.filter((r) => r.manual), empty));
  };

  // The pieces that have rows, in the order the table shows them — what the
  // "add a line" buttons are offered for.
  const piecesInTable = useMemo(() => {
    const seen: string[] = [];
    for (const r of rows) if (!seen.includes(r.subDesignNo)) seen.push(r.subDesignNo);
    return seen;
  }, [rows]);

  const addedCount = rows.filter((r) => r.manual).length;


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

  const issueCols = addOn
    ? [...columnsFor("issue"), commentsCol]
    : columnsFor("issue");

  const spans = useMemo(() => mergeSpans(rows), [rows]);

  // Where one piece ends and the next begins. Same reason as on the register:
  // several stone sizes running down the page read as one undivided list
  // otherwise, and the entries being typed belong to different pieces.
  const blocks = useMemo(() => {
    const startsAt = new Set<number>();
    const ordinal: number[] = [];
    const byPiece = spans.get("subDesignNo");
    let n = -1;
    for (let i = 0; i < rows.length; i++) {
      if (byPiece?.get(i) !== undefined) { startsAt.add(i); n++; }
      ordinal[i] = Math.max(n, 0);
    }
    return { startsAt, ordinal };
  }, [rows, spans]);

  // Whether the sheet names a piece against any of its sizes — worth saying,
  // because it is the difference between two entries and four.
  const perPiece = (seed?.lines || []).some((l) => (l.pieces || "").trim());
  // Every size going into every piece, with more than one of each. That is a
  // real design — a pair of earrings set with two sizes each — and it is also
  // exactly what a PD sheet looks like when "Goes to" was left on All pieces
  // and should not have been. The screen cannot tell the two apart, so it says
  // what it is about to do and leaves the judgement to whoever has the packet.
  // Once lines have been taken off, the point has been taken — the warning
  // would only be restating a number that is no longer on the screen.
  const crossed =
    !!seed && !addOn && !perPiece && seed.lines.length > 1 && picked.size > 1 &&
    removed.size === 0;

  // The opposite worry on an add-on: a piece with no diamonds out against it
  // has nothing to top up.
  const notIssued = (seed?.pieces || [])
    .filter((p) => !p.issued && picked.has(p.no))
    .map((p) => p.no);

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
          // `manual` is the form's own bookkeeping. The register stores an
          // added line like any other, so it does not travel.
          rows: rows.map(({ manual, ...row }) => row),
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
              {/* The sheet the diamonds are being issued against, to read while
                  entering them. A new tab, because the entry being typed here
                  is not saved yet and must not be lost to a back button. */}
              {seed.pdId ? (
                <a
                  className="jg-tag jg-tag-link"
                  href={`/jangad/pd/${encodeURIComponent(seed.pdId)}`}
                  target="_blank"
                  rel="noreferrer"
                  title="Open this design's PD sheet to read"
                >
                  {seed.pdNo} ↗
                </a>
              ) : (
                <span className="jg-tag">{seed.pdNo}</span>
              )}
              {seed.demandNo && <span className="jg-tag">{seed.demandNo}</span>}
              {seed.product && <span className="jg-muted">{seed.product}</span>}
            </div>

            <div className="jg-mode">
              <button
                type="button"
                className={!addOn ? "on" : ""}
                onClick={() => setMode(false)}
              >
                Issue from the PD sheet
              </button>
              <button
                type="button"
                className={addOn ? "on" : ""}
                onClick={() => setMode(true)}
              >
                Add-on diamonds
              </button>
            </div>
            {addOn && (
              <p className="pieces-hint">
                Stones going out against a piece that already has its diamonds —
                a stone broken at the factory, or a bag that came up short. The
                lines start empty because the PD sheet&rsquo;s sizes already
                went out; write only what is actually going now, and put the
                reason in <b>Comments</b>. It goes on its own memo.
              </p>
            )}

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
                    {/* On an add-on the question is which stone broke, so what
                        the piece already holds is worth having in front of you. */}
                    {addOn && p.issued?.sizes.length ? (
                      <small className="jg-has">{p.issued.sizes.join(" · ")}</small>
                    ) : null}
                  </label>
                ))}
              </div>
              <p className="pieces-hint">
                {addOn
                  ? `${rows.length} ${rows.length === 1 ? "line" : "lines"} to write — add one per stone going out.`
                  : !seed.lines.length
                  ? "This design has no diamond sizes on its PD sheet, so the sizes are yours to fill in."
                  : `${seed.lines.length} diamond ${seed.lines.length === 1 ? "size" : "sizes"} on this design${perPiece ? ", drawn one to a piece" : ""} — ${rows.length} ${rows.length === 1 ? "entry" : "entries"} in all.`}
              </p>
              {crossed && (
                <p className="hint warn">
                  Every one of these {seed.lines.length} sizes is set to go into
                  every piece, so {picked.size} pieces come to{" "}
                  <b>{seed.lines.length * picked.size} entries</b>. If each piece
                  really takes only one of these sizes, take the wrong lines off
                  with the × beside the row number — and ask for <b>Goes to</b>{" "}
                  to be set on the PD sheet, so the next issue against this
                  design comes out right on its own.
                </p>
              )}
              {addOn && notIssued.length > 0 && (
                <p className="hint warn">
                  {notIssued.length === 1
                    ? `${notIssued[0]} has had no diamonds issued yet.`
                    : `${notIssued.length} of these have had no diamonds issued yet.`}{" "}
                  An add-on tops up a piece that already has its stones — for a
                  piece that has none, issue from the PD sheet instead.
                </p>
              )}
              {!addOn && reissuing.length > 0 && (
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
                      <tr
                        key={i}
                        className={[
                          r.manual ? "jg-added" : "",
                          blocks.startsAt.has(i) && i > 0 ? "jg-piece-top" : "",
                          blocks.ordinal[i] % 2 ? "jg-piece-alt" : "",
                        ].filter(Boolean).join(" ") || undefined}
                      >
                        <td className="jg-sr">
                          {i + 1}
                          <button
                            type="button"
                            className="jg-drop"
                            title={r.manual
                              ? "Remove this added line"
                              : "This piece does not take this size — leave it off"}
                            aria-label={`Remove line ${i + 1}`}
                            onClick={() => dropLine(i)}
                          >
                            ×
                          </button>
                        </td>
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

              <div className="jg-addline">
                <span className="jg-addline-label">
                  Need one more line than the demand asked for?
                </span>
                {piecesInTable.map((sub) => (
                  <button
                    key={sub}
                    type="button"
                    className="rowbtn"
                    onClick={() => addLine(sub)}
                  >
                    {piecesInTable.length === 1 ? "Add a line" : `Add a line to ${sub}`}
                  </button>
                ))}
                {removed.size > 0 && (
                  <button type="button" className="linkbtn" onClick={restoreLines}>
                    Put back the {removed.size} line{removed.size === 1 ? "" : "s"} taken off
                  </button>
                )}
              </div>
              <p className="pieces-hint">
                An added line goes out on the same memo, to the same factory, as
                the rest of the piece — the shape, size, stones and rate are
                yours to fill in. Nothing needs changing on the PD sheet.
              </p>

              <div className="pieces-actions">
                <button className="btn btn-primary" onClick={save} disabled={saving}>
                  {saving
                    ? "Saving…"
                    : `Save ${rows.length} ${addOn ? "add-on " : ""}${rows.length === 1 ? "entry" : "entries"}`}
                </button>
                {addedCount > 0 && (
                  <span className="jg-added-note">
                    {addedCount === 1 ? "1 line added" : `${addedCount} lines added`} by hand
                  </span>
                )}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

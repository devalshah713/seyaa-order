"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Combo from "@/components/Combo";
import { joinDesignNo } from "@/lib/designNo";
import {
  JANGAD_COLUMNS, SELL_STATUSES, SETTINGS, STAGES, STATUSES,
  STAGE_DATE, columnsFor, expectedCtsReturn, expectedPcsReturn, isMergedColumn,
  isPerPieceColumn, mergeSpans, mergedValue, missingStageDates, num,
  searchJangad, shortfall, totalPriceFor,
  type JangadColumn, type JangadField, type JangadRow, type JangadStage,
} from "@/lib/jangadConfig";

type View = JangadStage | "all";

// The three columns that say which entry you are looking at. They lead every
// stage, so filling in what came back never means guessing which line is which.
const ANCHORS: JangadField[] = ["subDesignNo", "shape", "size"];

// The design and the piece live in separate columns; together they are the
// piece's number.
const fullPieceNo = (r: JangadRow) => joinDesignNo(r.designNo, r.subDesignNo, "");

// The filters as the address bar writes them, so the page in hand and the page
// being asked for can be compared without the key order mattering.
function asQuery(f: { q: string; from: string; to: string; mfg: string }): string {
  const out = new URLSearchParams();
  if (f.q.trim()) out.set("q", f.q.trim());
  if (f.from) out.set("from", f.from);
  if (f.to) out.set("to", f.to);
  if (f.mfg) out.set("mfg", f.mfg);
  return out.toString();
}

export default function JangadClient({
  rows: saved,
  factories,
  cap,
  more,
  filtered,
  initialQuery,
  initialFrom,
  initialTo,
  initialMfg,
}: {
  rows: JangadRow[];
  factories: string[];
  cap: number;
  more: boolean;
  filtered: boolean;
  initialQuery: string;
  initialFrom: string;
  initialTo: string;
  initialMfg: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<JangadRow[]>(saved);
  const [q, setQ] = useState(initialQuery);
  const [view, setView] = useState<View>("issue");
  // Filters kept apart from the free-text search: an audit asks "everything
  // that went to this factory in July", which is a date range and a name, not
  // a phrase.
  //
  // All four are held here as well as in the address bar: typing is answered
  // straight away out of the rows in hand, and the address bar catches up a
  // moment later so the server can fetch the rows that are not.
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [mfg, setMfg] = useState(initialMfg);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // Set by "Show them" on the blocked-save message: the entries holding the
  // save up, so they can be dealt with without hunting through the register.
  const [focus, setFocus] = useState<Set<string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  // Which entries somebody has actually typed in.
  //
  // What goes back is still decided by comparing against the saved copy, so
  // typing a figure and typing it back out again sends nothing. But that
  // comparison used to run over the whole register on every keystroke, writing
  // out every row twice as text to compare them: four milliseconds a letter at
  // five hundred entries and thirty-six at four thousand, which is what made
  // the register feel like it was typing a word behind. Now only the rows
  // somebody has been in are compared, and there are never many of those.
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const markTouched = (ids: string[]) =>
    setTouched((prev) => {
      if (ids.every((id) => prev.has(id))) return prev;
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });

  const beforeById = useMemo(() => new Map(saved.map((r) => [r.id, r])), [saved]);

  // Only what actually changed goes back, so two people working different
  // stages of the same design do not overwrite each other's whole row.
  const dirty = useMemo(() => {
    if (!touched.size) return [];
    return rows.filter(
      (r) =>
        touched.has(r.id) &&
        JSON.stringify(beforeById.get(r.id)) !== JSON.stringify(r)
    );
  }, [rows, beforeById, touched]);

  // The filters, into the address bar, a moment after the last keystroke.
  //
  // That round trip is what fetches the rows this page has not got: the server
  // narrows the register and sends back the entries the filters name. Waiting
  // out the typing matters — one trip per letter would be one request per
  // letter.
  const wanted = asQuery({ q, from, to, mfg });
  const current = asQuery({
    q: initialQuery, from: initialFrom, to: initialTo, mfg: initialMfg,
  });
  useEffect(() => {
    if (wanted === current) return;
    const timer = setTimeout(() => {
      router.replace(wanted ? `/jangad?${wanted}` : "/jangad", { scroll: false });
    }, 400);
    return () => clearTimeout(timer);
  }, [wanted, current, router]);

  // The page the server sent, taken up as the rows in hand.
  //
  // A filter change is a fresh page of the register, so what is held has to be
  // replaced by it, and so does the refresh after a save. What must not happen
  // is that figures somebody typed and has not saved disappear because the page
  // underneath them changed: so a touched entry keeps what was typed, and one
  // the new page does not carry at all is kept anyway, at the end, where it
  // stays countable by Save rather than being quietly dropped.
  useEffect(() => {
    setRows((prev) => {
      const typed = new Map(
        prev.filter((r) => touched.has(r.id)).map((r) => [r.id, r])
      );
      if (!typed.size) return saved;
      const next = saved.map((r) => typed.get(r.id) || r);
      const onPage = new Set(saved.map((r) => r.id));
      return [...next, ...[...typed.values()].filter((r) => !onPage.has(r.id))];
    });
    // touched is read rather than depended on: a keystroke must not pull the
    // page back from under the person typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  // Dates are stored as yyyy-mm-dd, which compares correctly as text.
  const inRange = useMemo(() => {
    return (r: JangadRow) =>
      (!from || (r.date && r.date >= from)) &&
      (!to || (r.date && r.date <= to)) &&
      (!mfg || r.mfgName === mfg);
  }, [from, to, mfg]);

  // The same filtering as ever, over the rows this page was given. The server
  // has already narrowed the register to those; this is what answers a keystroke
  // before the round trip catches up, and it is searchJangad() on both sides so
  // the two can never disagree about what a phrase names.
  const shown = useMemo(() => {
    if (focus) return rows.filter((r) => focus.has(r.id));
    return searchJangad(rows.filter(inRange), q);
  }, [q, rows, inRange, focus]);

  const spans = useMemo(() => mergeSpans(shown), [shown]);

  // Which piece each row belongs to, and which row starts one. Four stone
  // sizes down a page look like four unrelated lines; the accountant filling
  // in what came back needs to see at a glance where -10 ends and -11 begins.
  const blocks = useMemo(() => {
    const startsAt = new Set<number>();
    const ordinal: number[] = [];
    const byPiece = spans.get("subDesignNo");
    let n = -1;
    for (let i = 0; i < shown.length; i++) {
      if (byPiece?.get(i) !== undefined) { startsAt.add(i); n++; }
      ordinal[i] = Math.max(n, 0);
    }
    return { startsAt, ordinal };
  }, [shown, spans]);

  const cols: JangadColumn[] =
    view === "all"
      ? JANGAD_COLUMNS
      : [
          ...(view === "issue"
            ? []
            : (ANCHORS.map((k) => JANGAD_COLUMNS.find((c) => c.key === k)!) )),
          ...columnsFor(view),
        ];

  // What is ticked for printing. Kept as ids rather than indexes so filtering
  // or reordering the list underneath cannot change what was chosen.
  const shownIds = useMemo(() => shown.map((r) => r.id), [shown]);
  const pickedShown = shownIds.filter((id) => picked.has(id));

  const toggle = (ids: string[], on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const id of ids) { if (on) next.add(id); else next.delete(id); }
      return next;
    });

  const allShownPicked = shownIds.length > 0 && pickedShown.length === shownIds.length;

  // Entries carrying figures for a stage that has no date on it. Saving these
  // would put weights into the register that cannot be placed in time — no use
  // in an audit and impossible to reconcile against a memo — so the save waits
  // for the date rather than accepting them and hoping someone comes back.
  const undated = useMemo(
    () => dirty.filter((r) => missingStageDates(r).length > 0),
    [dirty]
  );

  const undatedNote = useMemo(() => {
    if (!undated.length) return "";
    const stages = new Set<JangadStage>();
    for (const r of undated) for (const st of missingStageDates(r)) stages.add(st);
    // Naming the column is not enough when it lives on a tab that is not the
    // one being worked on — which is the usual case, since a stage is normally
    // finished from its own screen.
    const names = [...stages]
      .map((st) => {
        const col = JANGAD_COLUMNS.find((c) => c.key === STAGE_DATE[st])!.header;
        const tabName = STAGES.find((x) => x.key === st)!.label;
        return st === view ? col : `${col} (on the ${tabName} tab)`;
      })
      .join(" and ");
    const which = undated
      .slice(0, 3)
      .map((r) => `${fullPieceNo(r)} ${r.shape}`.trim())
      .join(", ");
    const more = undated.length > 3 ? ` and ${undated.length - 3} more` : "";
    return `${undated.length} ${undated.length === 1 ? "entry has" : "entries have"} figures but no ${names}: ${which}${more}.`;
  }, [undated, view]);

  // Rows whose issued, studded and returned figures do not reconcile. The mark
  // on the row carries the amount in its tooltip, but the columns it is talking
  // about are usually on another tab, so it is said out loud here too.
  const mismatched = useMemo(() => shown.filter((r) => shortfall(r)), [shown]);

  const mismatchNote = useMemo(() => {
    if (!mismatched.length) return "";
    const one = (r: JangadRow) => {
      const gap = shortfall(r)!;
      const by = [gap.cts && `${gap.cts} cts`, gap.pcs && `${gap.pcs} pcs`]
        .filter(Boolean).join(" and ");
      return `${fullPieceNo(r)} ${r.shape} — ${by}`;
    };
    const which = mismatched.slice(0, 3).map(one).join("; ");
    const more = mismatched.length > 3 ? ` and ${mismatched.length - 3} more` : "";
    return `${mismatched.length} ${mismatched.length === 1 ? "entry does" : "entries do"} not add up: ${which}${more} unaccounted for.`;
  }, [mismatched]);

  function showMismatched() {
    setView("returned");
    setFocus(new Set(mismatched.map((r) => r.id)));
  }

  // Take them to the entries, on the tab whose date is missing.
  function showUndated() {
    const first = undated.flatMap((r) => missingStageDates(r))[0];
    if (first) setView(first);
    setFocus(new Set(undated.map((r) => r.id)));
    setError("");
  }

  const readOnly = (key: JangadField) =>
    view !== "issue" && view !== "all" && ANCHORS.includes(key);

  // A merged cell is one box standing for several rows — the date of an issue,
  // the memo it went out on — so writing in it writes to every row it covers.
  function setCells(ids: string[], key: JangadField, value: string) {
    setNote("");
    const wanted = new Set(ids);
    markTouched(ids);
    setRows((list) => list.map((r) => (wanted.has(r.id) ? { ...r, [key]: value } : r)));
  }

  function setCell(id: string, key: JangadField, value: string) {
    setNote("");
    markTouched([id]);
    setRows((list) =>
      list.map((r) => {
        if (r.id !== id) return r;
        const next: JangadRow = { ...r, [key]: value };

        // Total Price is the rate times what was actually studded — the one
        // figure in the sheet that is pure arithmetic.
        if (key === "ctsUsed" || key === "price") {
          next.totalPrice = totalPriceFor(next.ctsUsed, next.price);
        }
        // The difference that should come back is worked out the moment the
        // used figures are known, so nobody does the subtraction by hand. It
        // keeps up too: comparing against what the old figures implied says
        // whether anyone has typed over it, and if not it is still ours to
        // maintain. Left stale, a corrected count made the row read as short by
        // exactly the correction.
        if (key === "carats" || key === "ctsUsed") {
          if (!r.ctsReturn || r.ctsReturn === expectedCtsReturn(r)) {
            next.ctsReturn = expectedCtsReturn(next);
          }
        }
        if (key === "pcs" || key === "pcsUsed") {
          if (!r.pcsReturn || r.pcsReturn === expectedPcsReturn(r)) {
            next.pcsReturn = expectedPcsReturn(next);
          }
        }

        // Status follows the work, but only forward, and only on the dates. A
        // weight typed into a row is not the same as the jewellery having come
        // back on a day someone is willing to put their name to.
        if (key === "receivedDate" && value && next.status === "Issued") {
          next.status = "Received";
        }
        if (key === "returnDate" && value && next.status === "Received") {
          next.status = "Returned";
        }
        return next;
      })
    );
  }

  async function save() {
    if (!dirty.length) return;
    if (undated.length) {
      setNote("");
      setError(`${undatedNote} Fill the date in before saving — the boxes are marked.`);
      showUndated();
      return;
    }
    setError("");
    setNote("");
    setSaving(true);
    try {
      const res = await fetch("/api/jangad", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: dirty }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Could not save (${res.status}).`);
      setNote(`Saved ${dirty.length} ${dirty.length === 1 ? "entry" : "entries"}.`);
      // Everything typed is now in the register, so nothing is waiting to go
      // back. The refresh below brings the saved copy up to date behind it.
      setTouched(new Set());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function del(row: JangadRow) {
    if (!window.confirm(`Delete the entry for ${row.subDesignNo || row.designNo}?`)) return;
    setError("");
    try {
      const res = await fetch(`/api/jangad/${row.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Could not delete.");
      }
      setRows((list) => list.filter((r) => r.id !== row.id));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
    }
  }

  function cell(row: JangadRow, c: JangadColumn, covers: string[], groupValue?: string) {
    const value = groupValue ?? row[c.key];
    if (readOnly(c.key)) {
      // "63" alone says nothing when you are filling in what came back, so the
      // anchor shows the piece's whole number.
      const shownValue = c.key === "subDesignNo" ? fullPieceNo(row) : value;
      return <span className="jg-anchor">{shownValue || "—"}</span>;
    }

    const write = (v: string) =>
      covers.length > 1 ? setCells(covers, c.key, v) : setCell(row.id, c.key, v);

    if (c.key === "setting" || c.key === "status" || c.key === "sellGivenStatus") {
      const options =
        c.key === "setting" ? SETTINGS : c.key === "status" ? STATUSES : SELL_STATUSES;
      return <Combo value={value} onChange={write} options={options} placeholder="—" />;
    }
    // The sum the accountant would otherwise do, offered without being written
    // in: it vanishes the moment a real count is typed over it.
    const expect =
      c.key === "ctsReturn" ? expectedCtsReturn(row)
      : c.key === "pcsReturn" ? expectedPcsReturn(row)
      : "";

    return (
      <input
        type={c.kind === "date" ? "date" : "text"}
        inputMode={c.kind === "number" ? "decimal" : undefined}
        value={value}
        placeholder={expect ? `${expect} expected` : undefined}
        className={needsDate(row, c.key) ? "jg-needed" : undefined}
        onChange={(e) => write(e.target.value)}
      />
    );
  }

  // The date box a row is waiting on, so it can be pointed at directly.
  function needsDate(row: JangadRow, key: JangadField): boolean {
    const stages = missingStageDates(row);
    return stages.some((st) => STAGE_DATE[st] === key);
  }

  const totals = useMemo(() => {
    const sum = (k: JangadField) =>
      shown.reduce((n, r) => n + (num(r[k]) ?? 0), 0);
    return {
      carats: sum("carats"), used: sum("ctsUsed"),
      back: sum("ctsReturn"), price: sum("totalPrice"),
    };
  }, [shown]);

  return (
    <>
      <div className="jg-bar">
        <input
          className="search"
          value={q}
          onChange={(e) => { setQ(e.target.value); setFocus(null); }}
          placeholder="Design number, one piece, memo no. or stock code"
        />
        {/* Ticking is what "these ones" means everywhere else on this screen —
            it is what the issue slip prints — so the export follows it too.
            Nothing ticked still gives the whole register, which is what an
            archive copy wants. */}
        <a
          href={pickedShown.length
            ? `/api/jangad/export?ids=${encodeURIComponent(pickedShown.join(","))}`
            : "/api/jangad/export"}
          className="btn"
        >
          {pickedShown.length
            ? `Export ${pickedShown.length} selected`
            : "Export to Excel"}
        </a>
        <Link href="/jangad/new" className="btn btn-primary">+ Issue Diamonds</Link>
      </div>

      <div className="jg-filters no-print">
        <label className="field"><span>From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="field"><span>To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="field"><span>Factory</span>
          <select value={mfg} onChange={(e) => setMfg(e.target.value)}>
            <option value="">All factories</option>
            {/* Every factory the register has ever been issued to, counted by
                the database. The page's own rows would only ever list the ones
                it happens to be showing. */}
            {factories.map((f) => <option key={f} value={f}>{f}</option>)}
            {/* A factory filter set in the address bar for a factory that is
                not in the list any more still shows what it is filtering by. */}
            {mfg && !factories.includes(mfg) && <option value={mfg}>{mfg}</option>}
          </select></label>
        {(from || to || mfg) && (
          <button type="button" className="linkbtn"
            onClick={() => { setFrom(""); setTo(""); setMfg(""); }}>
            Clear filters
          </button>
        )}
      </div>

      <div className="kind-tabs jg-tabs">
        {STAGES.map((s) => (
          <button key={s.key} className={view === s.key ? "active" : ""}
            onClick={() => setView(s.key)}>
            {s.label}
          </button>
        ))}
        <button className={view === "all" ? "active" : ""} onClick={() => setView("all")}>
          Full sheet
        </button>
      </div>
      <p className="jg-blurb">
        {view === "all"
          ? "Every column of the workbook, in its order."
          : STAGES.find((s) => s.key === view)?.blurb}
      </p>

      {/* The register is thousands of entries and a page may only carry so
          many, so when it is cut short it says so and says what to do about
          it. Silence here would read as a register that had lost entries. */}
      {more && (
        <p className="jg-focus">
          {filtered
            ? `More than ${plain(cap)} entries match. Narrow the dates to see the rest.`
            : `Showing the latest ${plain(cap)} entries. Use the dates, the factory or the search box to find older ones.`}
        </p>
      )}

      {error && <p className="save-error" style={{ marginTop: 0 }}>{error}</p>}
      {note && <p className="pieces-ok">{note}</p>}

      {mismatched.length > 0 && (
        <p className="jg-mismatch">
          {mismatchNote}{" "}
          <button type="button" className="linkbtn" onClick={showMismatched}>
            Show {mismatched.length === 1 ? "it" : "them"}
          </button>
        </p>
      )}

      {/* The focus list is drawn from the entries on screen, so it covers the
          page of the register currently shown rather than the whole register.
          An entry outside the dates or the search in the address bar is not
          among these, and narrowing differently is how it is reached. */}
      {focus && (
        <p className="jg-focus">
          Showing the {focus.size} {focus.size === 1 ? "entry" : "entries"} waiting
          on a date.{" "}
          <button type="button" className="linkbtn" onClick={() => setFocus(null)}>
            Show everything again
          </button>
        </p>
      )}

      {shown.length > 0 && (
        <div className="jg-pick no-print">
          <label className="jg-pick-all">
            <input
              type="checkbox"
              checked={allShownPicked}
              onChange={(e) => toggle(shownIds, e.target.checked)}
            />
            <span>{allShownPicked ? "Clear selection" : "Select all shown"}</span>
          </label>
          <span className="jg-pick-count">
            {picked.size
              ? `${picked.size} selected for printing`
              : "Tick the entries going out on one memo"}
          </span>
          {picked.size > 0 && (
            <>
              <button type="button" className="linkbtn" onClick={() => setPicked(new Set())}>
                Clear
              </button>
              <Link
                href={`/jangad/print?ids=${encodeURIComponent(
                  shown.filter((r) => picked.has(r.id)).map((r) => r.id).join(",")
                )}`}
                className="btn btn-primary"
              >
                Print issue slip
              </Link>
            </>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="empty-state">
          {/* An empty page under a filter is not an empty register, and must
              not read as one: the dates or the search found nothing, which is
              a different thing to say. */}
          <p>
            {rows.length === 0 && !filtered
              ? "Nothing in the register yet. Issue diamonds against a design to start."
              : "No entries match that."}
          </p>
          {rows.length === 0 && !filtered && (
            <Link href="/jangad/new" className="btn btn-primary">Issue Diamonds</Link>
          )}
        </div>
      ) : (
        <>
          <div className="jg-scroll">
            <table className="jg-table">
              <thead>
                <tr>
                  <th className="jg-pickcol" />
                  <th className="jg-sr">#</th>
                  {cols.map((c) => <th key={c.key}>{c.header}</th>)}
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => {
                  const gap = shortfall(r);
                  const undatedStages = missingStageDates(r);
                  // One box per piece — SN-BR-AMF-20CTS-10, then -11, then -12 —
                  // because a piece is what goes out, gets studded and comes
                  // back. Merging on the design instead would put a whole run
                  // of pieces under one tick, which is not a thing anyone hands
                  // over as a unit.
                  const pickSpan = spans.get("subDesignNo")?.get(i);
                  const pickCovers = pickSpan === undefined
                    ? []
                    : shown.slice(i, i + pickSpan).map((x) => x.id);
                  return (
                    <tr
                      key={r.id}
                      className={[
                        gap ? "jg-short" : "",
                        undatedStages.length ? "jg-undated" : "",
                        picked.has(r.id) ? "jg-on" : "",
                        // A rule where a piece starts, and every other piece
                        // shaded, so one entry reads as one block.
                        blocks.startsAt.has(i) && i > 0 ? "jg-piece-top" : "",
                        blocks.ordinal[i] % 2 ? "jg-piece-alt" : "",
                      ].filter(Boolean).join(" ") || undefined}
                    >
                      {/* One tick per piece, not per stone size. A bracelet
                          with four stone sizes took four ticks to print one
                          slip; now the box rules down its rows exactly as the
                          Sub Design No cell beside it does. */}
                      {pickSpan !== undefined && (
                        <td
                          className={`jg-pickcol${pickSpan > 1 ? " merged" : ""}`}
                          rowSpan={pickSpan > 1 ? pickSpan : undefined}
                        >
                          <input
                            type="checkbox"
                            checked={pickCovers.every((id) => picked.has(id))}
                            ref={(el) => {
                              if (!el) return;
                              const some = pickCovers.some((id) => picked.has(id));
                              el.indeterminate = some && !pickCovers.every((id) => picked.has(id));
                            }}
                            onChange={(e) => toggle(pickCovers, e.target.checked)}
                            aria-label={`Select ${fullPieceNo(r)}`}
                          />
                        </td>
                      )}
                      <td className="jg-sr">
                        {i + 1}
                        <button className="jg-drop" onClick={() => del(r)}
                          title="Delete this entry" aria-label="Delete this entry">×</button>
                        {gap && (
                          <span
                            className="jg-flag"
                            title={`Does not add up — ${[
                              gap.cts && `${gap.cts} cts`,
                              gap.pcs && `${gap.pcs} pcs`,
                            ].filter(Boolean).join(", ")} unaccounted for`}
                          >
                            !
                          </span>
                        )}
                        {/* A different mark from the one above: this row is
                            unfinished, not wrong. */}
                        {!gap && undatedStages.length > 0 && (
                          <span
                            className="jg-flag date"
                            title={`Needs ${undatedStages
                              .map((st) => JANGAD_COLUMNS.find((c) => c.key === STAGE_DATE[st])!.header)
                              .join(" and ")} before this entry can be saved`}
                          >
                            ?
                          </span>
                        )}
                      </td>
                      {cols.map((c) => {
                        const span = isMergedColumn(c.key)
                          ? spans.get(c.key)?.get(i)
                          : 1;
                        // No entry means a run started above and already
                        // covers this row, so this line draws no cell at all.
                        if (span === undefined) return null;
                        const covers = shown.slice(i, i + span).map((x) => x.id);
                        // Rows saved before these columns merged can carry the
                        // value on one line only, so the box shows whichever
                        // line has it rather than reading empty.
                        const groupValue = isPerPieceColumn(c.key)
                          ? mergedValue(shown, i, span, c.key)
                          : undefined;
                        return (
                          <td
                            key={c.key}
                            data-label={c.header}
                            rowSpan={span > 1 ? span : undefined}
                            className={span > 1 ? "merged" : undefined}
                          >
                            {cell(r, c, covers, groupValue)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="jg-foot">
            <span>{shown.length} of {rows.length} entries</span>
            <span>Issued <b>{round(totals.carats)}</b> cts</span>
            <span>Used <b>{round(totals.used)}</b> cts</span>
            <span>Returned <b>{round(totals.back)}</b> cts</span>
            <span>Value <b>{round(totals.price, 2)}</b></span>
          </div>

          <div className="pieces-actions">
            <button className="btn btn-primary" onClick={save} disabled={saving || !dirty.length}>
              {saving ? "Saving…" : dirty.length ? `Save ${dirty.length} changed` : "Saved"}
            </button>
            {undated.length > 0 && (
              <span className="jg-blocked">
                {undatedNote}{" "}
                <button type="button" className="linkbtn" onClick={showUndated}>
                  Show them
                </button>
              </span>
            )}
          </div>
        </>
      )}
    </>
  );
}

function round(n: number, dp = 3): string {
  return String(parseFloat(n.toFixed(dp)));
}

// A figure as it is read out loud: 1000 is a thousand, written "1,000". The
// locale is named rather than left to the browser, so the page the server sends
// and the page the browser draws say the same thing.
function plain(n: number): string {
  return n.toLocaleString("en-US");
}

"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Combo from "@/components/Combo";
import { joinDesignNo, matchDesign } from "@/lib/designNo";
import {
  JANGAD_COLUMNS, SELL_STATUSES, SETTINGS, STAGES, STATUSES,
  columnsFor, expectedCtsReturn, expectedPcsReturn, isMergedColumn, mergeSpans,
  num, shortfall, totalPriceFor,
  type JangadColumn, type JangadField, type JangadRow, type JangadStage,
} from "@/lib/jangadConfig";

type View = JangadStage | "all";

// The three columns that say which entry you are looking at. They lead every
// stage, so filling in what came back never means guessing which line is which.
const ANCHORS: JangadField[] = ["subDesignNo", "shape", "size"];

// The design and the piece live in separate columns; together they are the
// piece's number.
const fullPieceNo = (r: JangadRow) => joinDesignNo(r.designNo, r.subDesignNo, "");

export default function JangadClient({
  rows: saved,
  initialQuery,
}: {
  rows: JangadRow[];
  initialQuery: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<JangadRow[]>(saved);
  const [q, setQ] = useState(initialQuery);
  const [view, setView] = useState<View>("issue");
  // Filters kept apart from the free-text search: an audit asks "everything
  // that went to this factory in July", which is a date range and a name, not
  // a phrase.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [mfg, setMfg] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  // Only what actually changed goes back, so two people working different
  // stages of the same design do not overwrite each other's whole row.
  const dirty = useMemo(() => {
    const before = new Map(saved.map((r) => [r.id, r]));
    return rows.filter((r) => JSON.stringify(before.get(r.id)) !== JSON.stringify(r));
  }, [rows, saved]);

  // Every manufacturer the register has ever been issued to, for the filter.
  const factories = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows) if (r.mfgName) seen.add(r.mfgName);
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  // Dates are stored as yyyy-mm-dd, which compares correctly as text.
  const inRange = useMemo(() => {
    return (r: JangadRow) =>
      (!from || (r.date && r.date >= from)) &&
      (!to || (r.date && r.date <= to)) &&
      (!mfg || r.mfgName === mfg);
  }, [from, to, mfg]);

  const shown = useMemo(() => {
    const scoped = rows.filter(inRange);
    const needle = q.trim();
    if (!needle) return scoped;
    const lower = needle.toLowerCase();

    // Naming one piece means that piece, not the whole design it came from, so
    // a piece-level hit wins outright when there is one. The register keeps the
    // design and the piece in separate columns, so the number being searched
    // for has to be put back together first.
    const byPiece = scoped.filter((r) => matchDesign(fullPieceNo(r), needle));
    if (byPiece.length) return byPiece;

    return scoped.filter((r) => {
      if (r.designNo && matchDesign(r.designNo, needle)) return true;
      // runNo is the whole run off the PD sheet ("…-63-67"), which no column
      // holds any more — matched as plain text so searching it still finds
      // every piece that was issued under it.
      return [r.runNo, r.memoNo, r.stockCode, r.certiNo, r.product,
              r.shape, r.size, r.status, r.mfgName]
        .join(" ").toLowerCase().includes(lower);
    });
  }, [q, rows, inRange]);

  const spans = useMemo(() => mergeSpans(shown), [shown]);

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

  const readOnly = (key: JangadField) =>
    view !== "issue" && view !== "all" && ANCHORS.includes(key);

  // A merged cell is one box standing for several rows — the date of an issue,
  // the memo it went out on — so writing in it writes to every row it covers.
  function setCells(ids: string[], key: JangadField, value: string) {
    setNote("");
    const wanted = new Set(ids);
    setRows((list) => list.map((r) => (wanted.has(r.id) ? { ...r, [key]: value } : r)));
  }

  function setCell(id: string, key: JangadField, value: string) {
    setNote("");
    setRows((list) =>
      list.map((r) => {
        if (r.id !== id) return r;
        const next: JangadRow = { ...r, [key]: value };

        // Total Price is the rate times what was actually studded — the one
        // figure in the sheet that is pure arithmetic.
        if (key === "ctsUsed" || key === "price") {
          next.totalPrice = totalPriceFor(next.ctsUsed, next.price);
        }
        // What should come back is filled in the moment the used figures are
        // known, so the accountant checks a number instead of working one out.
        // It stays editable — the point is to catch when the count differs.
        //
        // It also has to keep up. Comparing against what the old figures implied
        // tells us whether anyone has typed over it: if not, it is still ours to
        // maintain, and correcting a stone count corrects it too. Left stale, a
        // corrected count made the row read as short by exactly the correction.
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

        // Status follows the work, but only forward and only from the value it
        // would have had anyway.
        if ((key === "receivedDate" || key === "ctsUsed") && value && next.status === "Issued") {
          next.status = "Received";
        }
        if ((key === "returnDate" || key === "ctsReturn") && value && next.status === "Received") {
          next.status = "Returned";
        }
        return next;
      })
    );
  }

  async function save() {
    if (!dirty.length) return;
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

  function cell(row: JangadRow, c: JangadColumn, covers: string[]) {
    const value = row[c.key];
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
    return (
      <input
        type={c.kind === "date" ? "date" : "text"}
        inputMode={c.kind === "number" ? "decimal" : undefined}
        value={value}
        onChange={(e) => write(e.target.value)}
      />
    );
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
          onChange={(e) => setQ(e.target.value)}
          placeholder="Design number, one piece, memo no. or stock code"
        />
        <a href="/api/jangad/export" className="btn">Export to Excel</a>
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
            {factories.map((f) => <option key={f} value={f}>{f}</option>)}
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

      {error && <p className="save-error" style={{ marginTop: 0 }}>{error}</p>}
      {note && <p className="pieces-ok">{note}</p>}

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
          <p>
            {rows.length === 0
              ? "Nothing in the register yet. Issue diamonds against a design to start."
              : "No entries match that."}
          </p>
          {rows.length === 0 && (
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
                  <th className="jg-sr" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => {
                  const gap = shortfall(r);
                  return (
                    <tr
                      key={r.id}
                      className={[gap ? "jg-short" : "", picked.has(r.id) ? "jg-on" : ""]
                        .filter(Boolean).join(" ") || undefined}
                    >
                      <td className="jg-pickcol">
                        <input
                          type="checkbox"
                          checked={picked.has(r.id)}
                          onChange={(e) => toggle([r.id], e.target.checked)}
                          aria-label={`Select ${fullPieceNo(r)}`}
                        />
                      </td>
                      <td className="jg-sr">
                        {i + 1}
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
                      </td>
                      {cols.map((c) => {
                        const span = isMergedColumn(c.key)
                          ? spans.get(c.key)?.get(i)
                          : 1;
                        // No entry means a run started above and already
                        // covers this row, so this line draws no cell at all.
                        if (span === undefined) return null;
                        const covers = shown.slice(i, i + span).map((x) => x.id);
                        return (
                          <td
                            key={c.key}
                            data-label={c.header}
                            rowSpan={span > 1 ? span : undefined}
                            className={span > 1 ? "merged" : undefined}
                          >
                            {cell(r, c, covers)}
                          </td>
                        );
                      })}
                      <td className="jg-sr">
                        <button className="del" onClick={() => del(r)}
                          title="Delete entry" aria-label="Delete entry">×</button>
                      </td>
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
          </div>
        </>
      )}
    </>
  );
}

function round(n: number, dp = 3): string {
  return String(parseFloat(n.toFixed(dp)));
}

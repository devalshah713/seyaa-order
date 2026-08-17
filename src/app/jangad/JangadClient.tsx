"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Combo from "@/components/Combo";
import { joinDesignNo, matchDesign } from "@/lib/designNo";
import {
  JANGAD_COLUMNS, SELL_STATUSES, SETTINGS, STAGES, STATUSES,
  columnsFor, expectedCtsReturn, expectedPcsReturn, num, shortfall, totalPriceFor,
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  // Only what actually changed goes back, so two people working different
  // stages of the same design do not overwrite each other's whole row.
  const dirty = useMemo(() => {
    const before = new Map(saved.map((r) => [r.id, r]));
    return rows.filter((r) => JSON.stringify(before.get(r.id)) !== JSON.stringify(r));
  }, [rows, saved]);

  const shown = useMemo(() => {
    const needle = q.trim();
    if (!needle) return rows;
    const lower = needle.toLowerCase();

    // Naming one piece means that piece, not the whole design it came from, so
    // a piece-level hit wins outright when there is one. The register keeps the
    // design and the piece in separate columns, so the number being searched
    // for has to be put back together first.
    const byPiece = rows.filter((r) => matchDesign(fullPieceNo(r), needle));
    if (byPiece.length) return byPiece;

    return rows.filter((r) => {
      if (r.designNo && matchDesign(r.designNo, needle)) return true;
      // runNo is the whole run off the PD sheet ("…-63-67"), which no column
      // holds any more — matched as plain text so searching it still finds
      // every piece that was issued under it.
      return [r.runNo, r.memoNo, r.stockCode, r.certiNo, r.product,
              r.shape, r.size, r.status, r.mfgName]
        .join(" ").toLowerCase().includes(lower);
    });
  }, [q, rows]);

  const cols: JangadColumn[] =
    view === "all"
      ? JANGAD_COLUMNS
      : [
          ...(view === "issue"
            ? []
            : (ANCHORS.map((k) => JANGAD_COLUMNS.find((c) => c.key === k)!) )),
          ...columnsFor(view),
        ];

  const readOnly = (key: JangadField) =>
    view !== "issue" && view !== "all" && ANCHORS.includes(key);

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
        if (key === "ctsUsed" && !r.ctsReturn) next.ctsReturn = expectedCtsReturn(next);
        if (key === "pcsUsed" && !r.pcsReturn) next.pcsReturn = expectedPcsReturn(next);

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

  function cell(row: JangadRow, c: JangadColumn) {
    const value = row[c.key];
    if (readOnly(c.key)) {
      // "63" alone says nothing when you are filling in what came back, so the
      // anchor shows the piece's whole number.
      const shownValue = c.key === "subDesignNo" ? fullPieceNo(row) : value;
      return <span className="jg-anchor">{shownValue || "—"}</span>;
    }

    if (c.key === "setting" || c.key === "status" || c.key === "sellGivenStatus") {
      const options =
        c.key === "setting" ? SETTINGS : c.key === "status" ? STATUSES : SELL_STATUSES;
      return (
        <Combo value={value} onChange={(v) => setCell(row.id, c.key, v)}
          options={options} placeholder="—" />
      );
    }
    return (
      <input
        type={c.kind === "date" ? "date" : "text"}
        inputMode={c.kind === "number" ? "decimal" : undefined}
        value={value}
        onChange={(e) => setCell(row.id, c.key, e.target.value)}
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
                  <th className="jg-sr">#</th>
                  {cols.map((c) => <th key={c.key}>{c.header}</th>)}
                  <th className="jg-sr" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => {
                  const gap = shortfall(r);
                  return (
                    <tr key={r.id} className={gap ? "jg-short" : undefined}>
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
                      {cols.map((c) => (
                        <td key={c.key} data-label={c.header}>{cell(r, c)}</td>
                      ))}
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

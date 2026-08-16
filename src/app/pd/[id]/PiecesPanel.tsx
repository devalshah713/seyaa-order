"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PIECE_STATUSES, summarisePieces, type PdPiece, type PieceStatus,
} from "@/lib/designNo";

// Where each piece of a bulk design has got to. Until a piece is entered in the
// stock sheet and given a stock number, this row is the only record of it, and
// its design number is the only way to find it.
export default function PiecesPanel({
  id,
  designNo,
  pieces: saved,
}: {
  id: string;
  designNo: string;
  pieces: PdPiece[];
}) {
  const router = useRouter();
  const [pieces, setPieces] = useState<PdPiece[]>(saved);
  const [received, setReceived] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [justSaved, setJustSaved] = useState(false);

  const dirty = JSON.stringify(pieces) !== JSON.stringify(saved);
  const sum = summarisePieces(pieces);

  const set = (i: number, patch: Partial<PdPiece>) => {
    setJustSaved(false);
    setPieces((list) => list.map((p, n) => (n === i ? { ...p, ...patch } : p)));
  };

  // Filling in a stock number is what "this piece is now in stock" means, so
  // the status follows it rather than having to be set twice.
  const setStockNo = (i: number, stockNo: string) => {
    const p = pieces[i];
    const status: PieceStatus =
      stockNo.trim() && p.status !== "cancelled"
        ? "stock"
        : !stockNo.trim() && p.status === "stock"
        ? "ready"
        : p.status;
    set(i, { stockNo: stockNo.toUpperCase(), status });
  };

  // The usual way work starts: a few bags of diamonds arrive, and that many
  // pieces go into production — the lowest numbers first, as they are made.
  const startReceived = () => {
    const n = parseInt(received, 10);
    if (!isFinite(n) || n <= 0) return;
    setJustSaved(false);
    setPieces((list) => {
      // The counter lives inside the updater: React may run this more than
      // once for the same click, and a counter held outside would be spent by
      // the first run and leave the rest of the clicks doing nothing.
      let left = n;
      return list.map((p) => {
        if (left > 0 && p.status === "pending") {
          left--;
          return { ...p, status: "production" as PieceStatus };
        }
        return p;
      });
    });
    setReceived("");
  };

  async function save() {
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/pd/${id}/pieces`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pieces }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Could not save (${res.status}).`);
      if (data?.sheet?.pieces) setPieces(data.sheet.pieces);
      setJustSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the pieces.");
    } finally {
      setSaving(false);
    }
  }

  if (!pieces.length) {
    return (
      <section className="pieces no-print">
        <h3>Pieces</h3>
        <p className="pieces-hint">
          Add a design number to the sheet and its pieces will be listed here.
        </p>
      </section>
    );
  }

  return (
    <section className="pieces no-print">
      <div className="pieces-head">
        <h3>Pieces</h3>
        <p className="pieces-hint">
          <b>{sum.total}</b> {sum.total === 1 ? "piece" : "pieces"} under{" "}
          <code>{designNo}</code>
          {sum.total > 1 && <> — each one can be searched on its own.</>}
        </p>
        <div className="pieces-tally">
          <span>{sum.open} not started</span>
          <span>{sum.started} in hand</span>
          <span>{sum.inStock} in stock</span>
        </div>
      </div>

      {sum.open > 0 && (
        <div className="pieces-bags">
          <label className="field">
            <span>Bags of diamonds received</span>
            <input
              value={received}
              inputMode="numeric"
              placeholder="2"
              onChange={(e) => setReceived(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") startReceived(); }}
            />
          </label>
          <button type="button" className="btn" onClick={startReceived}>
            Start that many
          </button>
          <p className="pieces-hint">
            Puts the next unstarted pieces into production, lowest number first.
          </p>
        </div>
      )}

      <table className="pieces-table">
        <thead>
          <tr>
            <th>Design No.</th>
            <th>Status</th>
            <th>Stock No.</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {pieces.map((p, i) => (
            <tr key={p.no} className={p.status === "cancelled" ? "off" : undefined}>
              {/* data-label feeds the stacked card layout on a phone, where
                  the header row is off-screen. Unused on a wide screen. */}
              <td className="pno" data-label="Design No.">{p.no}</td>
              <td data-label="Status">
                <select
                  value={p.status}
                  onChange={(e) => set(i, { status: e.target.value as PieceStatus })}
                >
                  {PIECE_STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </td>
              <td data-label="Stock No.">
                <input
                  value={p.stockNo}
                  onChange={(e) => setStockNo(i, e.target.value)}
                  placeholder="—"
                  maxLength={6}
                />
              </td>
              <td data-label="Note">
                <input
                  value={p.note}
                  onChange={(e) => set(i, { note: e.target.value })}
                  placeholder="—"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="pieces-actions">
        <button className="btn btn-primary" onClick={save} disabled={saving || !dirty}>
          {saving ? "Saving…" : "Save pieces"}
        </button>
        {justSaved && !dirty && <span className="pieces-ok">Saved.</span>}
      </div>
      {error && <p className="save-error">{error}</p>}
    </section>
  );
}

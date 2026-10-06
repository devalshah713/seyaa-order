"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/lib/memoFormat";
import { matchDesign } from "@/lib/designNo";
import type { PdRow, PdRowPiece } from "@/lib/pdStore";

// This table is a client component, so every field it is given is written into
// the page the server sends. It is therefore given rows rather than whole PD
// sheets — see PdRow — and in particular it is not given each design's piece
// list, which on a book with bulk runs in it is thousands of entries the table
// would only count.

// `piece` is set when the search named one particular piece — by its design
// number, or by the stock number it was given once it reached the stock sheet.
type Result = { row: PdRow; piece: PdRowPiece | null; exact: boolean };

export default function PdHistoryTable({ rows }: { rows: PdRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  // The design number is the primary way in, so it is matched first and matched
  // properly: typing one piece of a bulk design ("…-10CT-46") finds the sheet it
  // was made under, which is written as the whole run ("…-10CT-45-49"). Only
  // then does the search fall back to the other columns.
  const results = useMemo<Result[]>(() => {
    const needle = q.trim();
    if (!needle) return rows.map((row) => ({ row, piece: null, exact: false }));
    const lower = needle.toLowerCase();

    const found: Result[] = [];
    for (const row of rows) {
      const hit = matchDesign(row.sku, needle);
      if (hit) {
        // matchDesign has already worked out the piece number, so it is used as
        // it stands. Only a piece that reached the stock sheet carries anything
        // more, and those are the ones sent.
        const piece =
          hit.kind === "piece"
            ? {
                no: hit.piece,
                stockNo: row.stocked.find((p) => p.no === hit.piece)?.stockNo || "",
              }
            : null;
        found.push({ row, piece, exact: hit.kind === "piece" });
        continue;
      }
      // A piece that has reached the stock sheet answers to its stock number too.
      const byStock = row.stocked.find((p) => p.stockNo.toLowerCase() === lower);
      if (byStock) {
        found.push({ row, piece: byStock, exact: true });
        continue;
      }
      const other = [
        row.pdNo, row.product, row.category, row.subCategory,
        row.assignedTo, row.pdMerchandiser, row.zone, row.orderType,
        row.diaQuality,
      ].join(" ").toLowerCase();
      if (other.includes(lower)) found.push({ row, piece: null, exact: false });
    }
    // A named piece is the most specific answer, so it goes to the top.
    return found.sort((a, b) => Number(b.exact) - Number(a.exact));
  }, [q, rows]);

  const pieceHits = results.filter((r) => r.exact).length;

  async function del(row: PdRow) {
    if (!window.confirm(`Delete PD sheet ${row.sku || row.pdNo}? This cannot be undone.`)) return;
    setError("");
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/pd/${row.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not delete.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <>
      <input
        className="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search a design number — one piece (SN-BR-AMF-10CT-46) or the whole run"
      />
      {q.trim() && (
        <p className="search-note">
          {pieceHits > 0
            ? `Found ${pieceHits === 1 ? "the design" : `${pieceHits} designs`} this piece was made under.`
            : `${results.length} ${results.length === 1 ? "match" : "matches"}.`}
        </p>
      )}
      {error && <p className="save-error" style={{ marginTop: 0 }}>{error}</p>}
      <table className="history">
        <thead>
          <tr>
            <th>Design No.</th>
            <th>Product</th>
            <th>Assigned to</th>
            <th>Delivery</th>
            <th>Made by</th>
            <th className="num">Pieces</th>
            <th className="actions-col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {results.map(({ row: s, piece }) => (
            <tr key={s.id} onClick={() => router.push(`/pd/${s.id}`)}>
              <td className="memono" style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12 }}>
                {s.sku || s.pdNo}
                {piece && (
                  <span className="piece-hit">
                    piece {piece.no}
                    {piece.stockNo ? ` · stock ${piece.stockNo}` : ""}
                  </span>
                )}
              </td>
              <td>{s.product || "—"}</td>
              <td>{s.assignedTo || "—"}</td>
              <td>{s.deliveryDate ? formatDate(s.deliveryDate) : "—"}</td>
              {/* Sheets written before authorship was recorded have no name
                  on them, and there is nothing to work it out from. */}
              <td>
                {s.createdBy || <span className="pd-nobody">not recorded</span>}
                {s.updatedBy && s.updatedBy !== s.createdBy && (
                  <span className="sub"> · last edit {s.updatedBy}</span>
                )}
              </td>
              <td className="num">
                {s.total ? (
                  <>
                    {s.total}
                    {s.inStock > 0 && (
                      <span className="sub"> · {s.inStock} in stock</span>
                    )}
                  </>
                ) : (
                  s.quantity || "—"
                )}
              </td>
              <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                <a
                  href={`/pd/${s.id}?pdf=1&print=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rowbtn"
                  title="Open the sheet and print it"
                >Print</a>
                <Link href={`/pd/${s.id}/edit`} className="rowbtn">Edit</Link>
                <button className="rowbtn danger" onClick={() => del(s)} disabled={busyId === s.id}>
                  {busyId === s.id ? "Deleting…" : "Delete"}
                </button>
              </td>
            </tr>
          ))}
          {results.length === 0 && (
            <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--panel-muted)" }}>No matches.</td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}

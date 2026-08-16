"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/lib/memoFormat";
import { matchDesign, summarisePieces, type PdPiece } from "@/lib/designNo";
import type { PdSheet } from "@/lib/pdStore";

// `piece` is set when the search named one particular piece — by its design
// number, or by the stock number it was given once it reached the stock sheet.
type Result = { sheet: PdSheet; piece: PdPiece | null; exact: boolean };

export default function PdHistoryTable({ sheets }: { sheets: PdSheet[] }) {
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
    if (!needle) return sheets.map((sheet) => ({ sheet, piece: null, exact: false }));
    const lower = needle.toLowerCase();

    const found: Result[] = [];
    for (const sheet of sheets) {
      const hit = matchDesign(sheet.sku, needle);
      if (hit) {
        const piece = hit.kind === "piece"
          ? sheet.pieces?.find((p) => p.no === hit.piece) || null
          : null;
        found.push({ sheet, piece, exact: hit.kind === "piece" });
        continue;
      }
      // A piece that has reached the stock sheet answers to its stock number too.
      const byStock = (sheet.pieces || []).find(
        (p) => p.stockNo && p.stockNo.toLowerCase() === lower
      );
      if (byStock) {
        found.push({ sheet, piece: byStock, exact: true });
        continue;
      }
      const other = [
        sheet.pdNo, sheet.product, sheet.category, sheet.subCategory,
        sheet.assignedTo, sheet.pdMerchandiser, sheet.zone, sheet.orderType,
        sheet.diaQuality,
      ].join(" ").toLowerCase();
      if (other.includes(lower)) found.push({ sheet, piece: null, exact: false });
    }
    // A named piece is the most specific answer, so it goes to the top.
    return found.sort((a, b) => Number(b.exact) - Number(a.exact));
  }, [q, sheets]);

  const pieceHits = results.filter((r) => r.exact).length;

  async function del(s: PdSheet) {
    if (!window.confirm(`Delete PD sheet ${s.sku || s.pdNo}? This cannot be undone.`)) return;
    setError("");
    setBusyId(s.id);
    try {
      const res = await fetch(`/api/pd/${s.id}`, { method: "DELETE" });
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
            <th className="num">Pieces</th>
            <th className="actions-col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {results.map(({ sheet: s, piece }) => {
            const sum = summarisePieces(s.pieces);
            return (
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
                <td className="num">
                  {sum.total ? (
                    <>
                      {sum.total}
                      {sum.inStock > 0 && (
                        <span className="sub"> · {sum.inStock} in stock</span>
                      )}
                    </>
                  ) : (
                    s.quantity || "—"
                  )}
                </td>
                <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                  <a href={`/api/pd/${s.id}/pdf`} className="rowbtn" title="Download PDF">PDF</a>
                  <Link href={`/pd/${s.id}/edit`} className="rowbtn">Edit</Link>
                  <button className="rowbtn danger" onClick={() => del(s)} disabled={busyId === s.id}>
                    {busyId === s.id ? "Deleting…" : "Delete"}
                  </button>
                </td>
              </tr>
            );
          })}
          {results.length === 0 && (
            <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--panel-muted)" }}>No matches.</td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}

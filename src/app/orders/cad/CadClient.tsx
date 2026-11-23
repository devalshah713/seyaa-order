"use client";
// The CAD request book, as a list.
//
// Above the table, the blocks that say what to do now, the way the quotation
// list does it. For the owner: the CADs that have come back and wait for his
// decision. For a seller: his own requests that are approved and can become an
// order, and his own still with the factory, so none is forgotten.
//
// It borrows the orders list's table, so at phone width each request reads as a
// card rather than columns sliding off the side.
import { useMemo, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/memoFormat";
import { cadStatusLabel, searchCadRows, type CadRow } from "@/lib/cadConfig";

function stoneLine(r: CadRow): string {
  return [
    r.lab && r.lab !== "None" ? `${r.lab}${r.certNo ? ` ${r.certNo}` : ""}` : "",
    r.shape,
    r.carats ? `${r.carats} ct` : "",
  ].filter(Boolean).join(" · ");
}

function QueueRow({ row }: { row: CadRow }) {
  return (
    <div className="ord-q-row">
      <div>
        <Link href={`/orders/cad/${row.id}`} className="q-no">{row.cadNo}</Link>
        <strong>{row.category || "Piece"}</strong>
        <span className="ev-meta">
          {row.factory} · {stoneLine(row)}
        </span>
        <span className="ev-meta">
          by {row.enteredBy || "unknown"} on {formatDate(row.date)}
        </span>
      </div>
      <div className="q-actions">
        <Link href={`/orders/cad/${row.id}`} className="btn btn-primary">Open it</Link>
      </div>
    </div>
  );
}

export default function CadClient({
  rows,
  me,
}: {
  rows: CadRow[];
  me: { username: string; isAdmin: boolean };
}) {
  const [q, setQ] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(true);

  // Not memoised: a few hundred rows filtered twice costs less than the hooks.
  const mineOrAll = (r: CadRow) => me.isAdmin || r.enteredBy === me.username;
  const toDecide = rows.filter((r) => r.status === "received" && mineOrAll(r));
  const ready = rows.filter((r) => r.status === "approved" && mineOrAll(r));

  const filtered = useMemo(() => {
    const kept = onlyOpen ? rows.filter((r) => r.status !== "ordered") : rows;
    return searchCadRows(kept, q);
  }, [rows, q, onlyOpen]);

  return (
    <>
      {toDecide.length > 0 && (
        <div className="ord-queue">
          <h2>
            {me.isAdmin ? "CAD back, waiting for your approval" : "CAD back, with the owner"}
            <span className="q-count">{toDecide.length}</span>
          </h2>
          {toDecide.map((r) => <QueueRow key={r.id} row={r} />)}
        </div>
      )}

      {ready.length > 0 && (
        <div className="ord-queue qt-ready">
          <h2>
            Approved, ready to become an order
            <span className="q-count">{ready.length}</span>
          </h2>
          {ready.map((r) => <QueueRow key={r.id} row={r} />)}
        </div>
      )}

      <div className="sheet-controls">
        <input
          className="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search CAD no., factory, stone, certificate…"
        />
        <label className="sheet-toggle">
          <input
            type="checkbox"
            checked={onlyOpen}
            onChange={(e) => setOnlyOpen(e.target.checked)}
          />
          <span>Hide the ones that became orders</span>
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="empty-state">
          {rows.length === 0 ? "No CAD requests yet." : "No CAD requests match."}
        </p>
      ) : (
        <table className="history orders-table cad-table">
          <thead>
            <tr>
              <th>CAD request</th><th>Piece</th><th>Centre stone</th>
              <th>Where it is</th><th>Became an order</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td className="memono">
                  <Link href={`/orders/cad/${r.id}`}>{r.cadNo}</Link>
                  <div className="ev-meta">{formatDate(r.date)}</div>
                  <div className="ev-meta">by {r.enteredBy || "not recorded"}</div>
                </td>
                <td>
                  <strong>{r.category || "—"}</strong>
                  <div className="ev-meta">{r.factory}</div>
                  {r.goldDetails && <div className="ev-meta">{r.goldDetails}</div>}
                </td>
                <td data-label="Centre stone">{stoneLine(r) || "—"}</td>
                <td data-label="Where it is">
                  <span className={`cad-state cad-${r.status}`}>{cadStatusLabel(r.status)}</span>
                </td>
                <td data-label="Became an order">
                  {r.orderId ? (
                    <Link href={`/orders/${r.orderId}`}>{r.orderNo || r.orderId}</Link>
                  ) : (
                    <span className="hint">Not yet</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

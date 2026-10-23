"use client";
// The quotation book, as a list.
//
// Each row carries both figures: what the piece costs on today's price list and
// what was actually quoted. A row where the two differ says so, because the
// difference is the thing worth looking at later — and the figures move when a
// rate changes, because nothing is stamped onto a quotation.
//
// It borrows the orders list's own table and its classes, so at phone width
// each quotation reads as a card with its labels shown rather than as nine
// columns sliding off the right-hand side. The two money columns are not among
// the ones the phone hides: a quotation with its price one tap away would be
// pointless.
import { useMemo, useState } from "react";
import Link from "next/link";
import { diaCertificationLabel, formatDate } from "@/lib/memoFormat";
import { money } from "@/lib/priceList";
import { searchQuotations, type QuotationRow } from "@/lib/quotationConfig";

export default function QuotationsClient({ rows }: { rows: QuotationRow[] }) {
  const [q, setQ] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(false);

  const filtered = useMemo(() => {
    const kept = onlyOpen ? rows.filter((r) => !r.quotation.orderId) : rows;
    // Searched over the quotations themselves, by the one rule the server and
    // the page share.
    const found = new Set(
      searchQuotations(kept.map((r) => r.quotation), q).map((x) => x.id)
    );
    return kept.filter((r) => found.has(r.quotation.id));
  }, [rows, q, onlyOpen]);

  return (
    <>
      <div className="sheet-controls">
        <input
          className="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search quotation no., customer, product, category, size…"
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
        <p className="empty-state">No quotations to show.</p>
      ) : (
        <table className="history orders-table qt-table">
          <thead>
            <tr>
              <th>Quotation</th><th>What is being made</th><th>Gold</th>
              <th className="num">Quoted, per piece</th>
              <th className="num">Calculated, per piece</th>
              <th>Became an order</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ quotation: x, calculated, quoted, differs }) => (
              <tr key={x.id}>
                <td className="memono">
                  <Link href={`/orders/quotations/${x.id}`}>{x.quotationNo}</Link>
                  <div className="ev-meta">{formatDate(x.date)}</div>
                  <div className="ev-meta">by {x.enteredBy || "not recorded"}</div>
                </td>
                <td>
                  <strong>{x.productName}</strong>
                  <div className="ev-meta">for {x.customerName}</div>
                  {(x.category || x.subCategory) && (
                    <div className="ev-meta">
                      {[x.category, x.subCategory, x.subSubCategory].filter(Boolean).join(" · ")}
                    </div>
                  )}
                  <div className="ev-meta">
                    {x.pcs} {x.pcs === 1 ? "pc" : "pcs"}
                    {x.size ? ` · ${x.size}` : ""}
                    {" · "}
                    {diaCertificationLabel(x.diaCertification)}
                  </div>
                </td>
                <td className="c-detail" data-label="Gold">
                  {[x.goldDetails, x.goldWt ? `${x.goldWt} g` : ""].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="num qt-money" data-label="Quoted, per piece">
                  <b>${money(quoted.usd)}</b>
                  <div className="ev-meta">₹{money(quoted.inr)}</div>
                </td>
                <td className="num qt-money" data-label="Calculated, per piece">
                  ${money(calculated.usd)}
                  <div className="ev-meta">₹{money(calculated.inr)}</div>
                  {differs && <div className="ev-meta qt-differs">not the quoted price</div>}
                </td>
                <td data-label="Became an order">
                  {x.orderId ? (
                    <Link href={`/orders/${x.orderId}`}>{x.orderNo || x.orderId}</Link>
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

"use client";
// The quotation book, as a list.
//
// Every quotation is in one of two states, and the list says which in the words
// of the person reading it: the owner's rows say it is waiting for his approval,
// a seller's say it is with the owner. Priced means the owner has approved it
// and the figures are there — what was quoted, and what the piece costs on
// today's price list, because nothing is stamped onto a quotation.
//
// Above the table sit the blocks that answer "what do I do now", the way the
// orders list puts the approval queue above the board. The owner's is the list
// of quotations to approve. A seller's is two short lists: the ones he is
// waiting on, and the ones that have come back priced and are his to read out.
// That second one is the whole way back in, so it is at the top of the page
// rather than something to hunt for.
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
import {
  isQuotationPriced, quotationStateLabel, searchQuotations, type QuotationRow,
} from "@/lib/quotationConfig";

// One row of a block above the table. The orders list's own queue row, so the
// two read as the same thing in the same place.
function QueueRow({ row }: { row: QuotationRow }) {
  const x = row.quotation;
  return (
    <div className="ord-q-row">
      <div>
        <Link href={`/orders/quotations/${x.id}`} className="q-no">{x.quotationNo}</Link>
        <strong>{x.productName}</strong>
        <span className="ev-meta">
          for {x.customerName} · {x.pcs} {x.pcs === 1 ? "pc" : "pcs"}
          {x.size ? ` · ${x.size}` : ""} · written by {x.enteredBy || "unknown"} on{" "}
          {formatDate(x.date)}
        </span>
        {isQuotationPriced(x) && (
          <span className="ev-meta">
            Priced at ${money(row.quoted.usd)} / ₹{money(row.quoted.inr)} per piece
          </span>
        )}
      </div>
      <div className="q-actions">
        <Link href={`/orders/quotations/${x.id}`} className="btn btn-primary">
          Open it
        </Link>
      </div>
    </div>
  );
}

export default function QuotationsClient({
  rows,
  me,
}: {
  rows: QuotationRow[];
  me: { username: string; isAdmin: boolean };
}) {
  const [q, setQ] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(false);

  // Not approved yet. The owner's to approve, so he sees all of them; a seller
  // sees his own, which is what he is waiting on.
  const waiting = useMemo(
    () =>
      rows.filter(
        (r) =>
          !isQuotationPriced(r.quotation) &&
          (me.isAdmin || r.quotation.enteredBy === me.username)
      ),
    [rows, me]
  );

  // Priced and still his to use: the seller's way back in. Not shown to the
  // owner, whose own list of these is the table below.
  const ready = useMemo(
    () =>
      me.isAdmin
        ? []
        : rows.filter(
            (r) =>
              isQuotationPriced(r.quotation) &&
              !r.quotation.orderId &&
              r.quotation.enteredBy === me.username
          ),
    [rows, me]
  );

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
      {ready.length > 0 && (
        <div className="ord-queue qt-ready">
          <h2>
            Priced, ready to give the customer
            <span className="q-count">{ready.length}</span>
          </h2>
          {ready.map((r) => <QueueRow key={r.quotation.id} row={r} />)}
        </div>
      )}

      {waiting.length > 0 && (
        <div className="ord-queue">
          <h2>
            {me.isAdmin ? "Waiting for your approval" : "With the owner for approval"}
            <span className="q-count">{waiting.length}</span>
          </h2>
          {waiting.map((r) => <QueueRow key={r.quotation.id} row={r} />)}
        </div>
      )}

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
            {filtered.map(({ quotation: x, calculated, quoted, differs }) => {
              const priced = isQuotationPriced(x);
              return (
              <tr key={x.id}>
                <td className="memono">
                  <Link href={`/orders/quotations/${x.id}`}>{x.quotationNo}</Link>
                  <div className="ev-meta">{formatDate(x.date)}</div>
                  <div className="ev-meta">by {x.enteredBy || "not recorded"}</div>
                  {/* Which of the two states, on the row itself, in the same
                      words as the block above it. */}
                  <div className={`ev-meta qt-state${priced ? " qt-is-priced" : ""}`}>
                    {quotationStateLabel(x, me.isAdmin)}
                  </div>
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
                {/* No figures before it is priced, and said in words rather
                    than as a dash: a blank where a price goes reads as free. */}
                {priced ? (
                  <>
                    <td className="num qt-money" data-label="Quoted, per piece">
                      <b>${money(quoted.usd)}</b>
                      <div className="ev-meta">₹{money(quoted.inr)}</div>
                    </td>
                    <td className="num qt-money" data-label="Calculated, per piece">
                      ${money(calculated.usd)}
                      <div className="ev-meta">₹{money(calculated.inr)}</div>
                      {differs && <div className="ev-meta qt-differs">not the quoted price</div>}
                    </td>
                  </>
                ) : (
                  <td className="qt-money" colSpan={2} data-label="Price">
                    <span className="hint">{quotationStateLabel(x, me.isAdmin)}</span>
                  </td>
                )}
                <td data-label="Became an order">
                  {x.orderId ? (
                    <Link href={`/orders/${x.orderId}`}>{x.orderNo || x.orderId}</Link>
                  ) : (
                    <span className="hint">Not yet</span>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

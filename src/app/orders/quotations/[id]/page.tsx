import Link from "next/link";
import { notFound } from "next/navigation";
import { getQuotation } from "@/lib/memoStore";
import { loadPrices } from "@/lib/priceStore";
import { COMPANY, diaCertificationLabel, formatDate } from "@/lib/memoFormat";
import { money, trim } from "@/lib/priceList";
import {
  forPieces, isQuotationPriced, perPiece, priceQuotation, quoteCarats,
  quoteDiffers, quoteShapeLine, quoteStones, quotationStateLabel, quotedFigure,
  ratelessMetal,
} from "@/lib/quotationConfig";
import { buildQuotationMessage } from "@/lib/quotationMessage";
import { photoSrc } from "@/lib/cloudinary";
import { currentSession } from "@/lib/currentUser";
import QuotationActions from "./QuotationActions";
import QuotationPricing from "./QuotationPricing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quotation — Seyaa Solitaire" };

// One line of the record. Left out entirely when there is nothing in it, so the
// page is what was written rather than a wall of dashes. The same Row the
// order's own page uses, and the same phone rules apply to it: at phone width
// the label sits above what it names.
function Row({ label, value }: { label: string; value?: string | number }) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  if (!text) return null;
  return (
    <div className="ord-row">
      <span>{label}</span>
      <strong>{text}</strong>
    </div>
  );
}

export default async function QuotationPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const quotation = await getQuotation(params.id).catch(() => null);
  if (!quotation) notFound();

  // Which of the two sittings it is in. There is nothing to price until the
  // owner has priced it, so almost everything about the money below hangs on
  // this one answer.
  const hasPrice = isQuotationPriced(quotation);
  const state = quotationStateLabel(quotation);
  const pricings = quotation.pricings || [];

  // Only the owner fills in the owner's half, and the route behind the panel
  // refuses anybody else as well. Hiding it is a courtesy, not the rule.
  const session = await currentSession();
  const isAdmin = session?.role === "admin";

  // Priced on the way out, from today's price list. Nothing was stamped onto
  // the quotation when it was saved, so a rate changed since shows here.
  const prices = await loadPrices();
  const priced = priceQuotation(prices, quotation);
  const quoted = quotedFigure(quotation, priced);
  const differs = quoteDiffers(quotation, priced);

  const photoUrl = photoSrc(quotation.photoPath);
  const carats = quoteCarats(quotation.lines);
  const stones = quoteStones(quotation.lines);
  const rateless = ratelessMetal(quotation.goldDetails);
  // No price, no words to send. Worked out here rather than inside the message,
  // which is handed a figure and has no way of knowing there is not one.
  const text = hasPrice ? buildQuotationMessage(quotation, quoted) : "";

  return (
    <div className="wrap qt-page">
      <div className="page-head no-print">
        <h1>{quotation.quotationNo}</h1>
        <p>
          {formatDate(quotation.date)} · for {quotation.customerName} · {state}
          {quotation.orderId && <> · became order {quotation.orderNo || quotation.orderId}</>}
        </p>
        <Link href="/orders/quotations" className="btn">← All quotations</Link>
        <Link href="/orders/quotations/new" className="btn btn-primary">New quotation</Link>
      </div>

      {/* On paper only: on screen this is the page head above, with the buttons
          beside it. */}
      <div className="print-only qt-head">
        <h2>{COMPANY.name}</h2>
        <p>{COMPANY.tagline}</p>
        <p>{COMPANY.address}</p>
        <h3>
          Quotation {quotation.quotationNo} · {formatDate(quotation.date)}
        </h3>
        <p>For {quotation.customerName}</p>
      </div>

      <div className="ord-view">
        <div className="ord-pic">
          {photoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={photoUrl} alt="Reference" />
          ) : (
            <p className="hint">
              No reference picture on this quotation. One is not needed to give a
              price.
            </p>
          )}
        </div>

        <div className="ord-facts">
          <h2>{quotation.productName}</h2>
          <Row label="Customer" value={quotation.customerName} />
          <Row label="Category" value={quotation.category} />
          <Row label="Sub-category" value={quotation.subCategory} />
          <Row label="Sub-sub-category" value={quotation.subSubCategory} />
          <Row label="Gold" value={quotation.goldDetails} />
          <Row
            label="Expected gold weight"
            value={quotation.goldWt ? `${quotation.goldWt} g` : ""}
          />
          {/* The labour rate is part of the owner's pricing, so it is a fact
              about this quotation only once there is one. */}
          {hasPrice && (
            <Row label="Labour" value={quotation.polkiLabour ? "Polki rate" : "Standard rate"} />
          )}
          <Row label="Size" value={quotation.size} />
          <Row label="Pieces" value={quotation.pcs} />
          <Row label="Diamond shape" value={quoteShapeLine(quotation.lines)} />
          <Row label="Diamond weight" value={carats > 0 ? `${carats.toFixed(2)} cts` : ""} />
          <Row label="Stones" value={stones > 0 ? `${stones} pcs` : ""} />
          <Row label="Certification" value={diaCertificationLabel(quotation.diaCertification)} />
          <Row label="Notes" value={quotation.notes} />

          <div className="ord-stamp no-print">
            <Row label="Quoted by" value={quotation.enteredBy || "not recorded"} />
            <Row
              label="Written on"
              value={`${formatDate(quotation.createdAt.slice(0, 10))} ${quotation.createdAt.slice(11, 16)}`}
            />
            {/* Every pricing and re-pricing, oldest first, the way an order's
                notes are kept. A customer argues about a price and the price
                changes; who changed it and when is part of the record. */}
            {pricings.map((p, i) => (
              <Row
                key={p.id}
                label={i === 0 ? "Priced by" : "Priced again by"}
                value={`${p.by} on ${formatDate(p.at.slice(0, 10))} ${p.at.slice(11, 16)}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Waiting for a price, said in plain words where the price would be, so
          nobody reads a blank panel as a free piece. Everybody sees this: the
          seller has to know his quotation is with the owner. */}
      {!hasPrice ? (
        <section className="qt-price qt-waiting">
          <h2>Waiting for a price</h2>
          <p className="hint">
            This quotation is with the owner. He puts the stones, the gold weight
            and the price on it.
            <br />
            There are no figures yet, so there is nothing to read to the customer.
          </p>
          <p className="hint">
            Open {quotation.quotationNo} again from the Quotations list once it
            shows as priced.
          </p>
        </section>
      ) : (
      /* The price. Two figures, said apart in words so nobody has to work out
         which is which: what was quoted, and what the piece costs today. */
      <section className="qt-price">
        <h2>The price quoted</h2>
        <table className="sb-money">
          <thead><tr><th>Per piece</th><th>$</th><th>₹</th></tr></thead>
          <tbody>
            <tr className="sb-grand">
              <td>Quoted to the customer</td>
              <td>{money(perPiece(quoted).usd)}</td>
              <td>{money(perPiece(quoted).inr)}</td>
            </tr>
            {quotation.pcs > 1 && (
              <tr>
                <td>For all {quotation.pcs} pieces</td>
                <td>{money(forPieces(quoted, quotation.pcs).usd)}</td>
                <td>{money(forPieces(quoted, quotation.pcs).inr)}</td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="hint no-print">
          {differs
            ? "This is not the calculated price. It was written by hand when the quotation was given, and it stays as it was given."
            : "This is the calculated price as it stood when the quotation was given."}
        </p>
      </section>
      )}

      {/* What the piece costs to make. Shown to everybody who can see orders,
          which is what the owner asked for, and not on the customer's copy: the
          print rules leave it out and the text to send never carries it.

          Only once it has been priced. Before that every figure in it would be
          nought, which reads as an answer and is not one. */}
      {hasPrice && (
      <section className="sb-total qt-cost no-print">
        <div className="sb-total-grid">
          <span>Total diamond weight</span><b>{trim(priced.totalWeight, 3)} cts</b>
          <span>Total stones</span><b>{priced.totalPcs || "—"}</b>
          <span>Pointers</span><b>{trim(priced.pointer, 2) || "—"}</b>
          <span>Gold rate used</span><b>{priced.karat}KT</b>
        </div>
        <table className="sb-money">
          <thead><tr><th>Cost today, per piece</th><th>$</th><th>₹</th></tr></thead>
          <tbody>
            <tr><td>Diamonds</td><td>{money(priced.diamond.usd)}</td><td>{money(priced.diamond.inr)}</td></tr>
            <tr><td>Gold</td><td>{money(priced.gold.usd)}</td><td>{money(priced.gold.inr)}</td></tr>
            <tr><td>Labour</td><td>{money(priced.labour.usd)}</td><td>{money(priced.labour.inr)}</td></tr>
            <tr className="sb-grand"><td>Calculated total</td><td>{money(priced.total.usd)}</td><td>{money(priced.total.inr)}</td></tr>
          </tbody>
        </table>
      </section>
      )}

      <div className="no-print">
        {hasPrice && priced.unknownCodes.length > 0 && (
          <p className="jg-mismatch">
            No price for {priced.unknownCodes.join(", ")} — that size counts at
            nothing, so the calculated figure above is short.
          </p>
        )}
        {hasPrice && rateless && (
          <p className="dia-note">
            The price list has no {rateless.toLowerCase()} rate, so the
            calculated figure uses the 14KT gold rate. The quoted price is the
            one to go by.
          </p>
        )}
      </div>

      {/* One line per stone size, as it was quoted. On the customer's copy too:
          which stones a piece is set with is part of what he is being quoted
          for. The money columns are not here. */}
      {quotation.lines.length > 0 && (
        <section className="sb-lines qt-sizes">
          <div className="sb-lines-head">
            <h2>Stone sizes</h2>
          </div>
          <div className="jg-scroll">
            <table className="jg-table sb-table">
              <thead>
                <tr>
                  <th className="jg-sr">#</th>
                  <th>Shape</th><th>Sieve / Size</th>
                  <th>Weight (cts)</th><th>Pcs</th>
                </tr>
              </thead>
              <tbody>
                {quotation.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="jg-sr">{i + 1}</td>
                    <td data-label="Shape">{l.shape || "—"}</td>
                    <td data-label="Sieve / Size">{l.sieve || "—"}</td>
                    <td data-label="Weight (cts)">{l.breakupWt || "—"}</td>
                    <td data-label="Pcs">{l.pcs || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* The owner's half. Once it has become an order the order is its own
          record, so there is nothing left to price here. */}
      {isAdmin && !quotation.orderId && (
        <QuotationPricing
          id={quotation.id}
          quotationNo={quotation.quotationNo}
          prices={prices}
          goldDetails={quotation.goldDetails}
          goldWt={quotation.goldWt}
          polkiLabour={!!quotation.polkiLabour}
          lines={quotation.lines}
          quotedUsd={quotation.quotedUsd}
          quotedInr={quotation.quotedInr}
          priced={hasPrice}
        />
      )}

      {quotation.orderId ? (
        <div className="ord-pd no-print">
          <h2>The customer said yes</h2>
          <p className="hint">
            This quotation already became order{" "}
            <b>{quotation.orderNo || quotation.orderId}</b>. Nothing else needs
            writing.
          </p>
          <Link href={`/orders/${quotation.orderId}`} className="btn btn-primary">
            Open the order
          </Link>
        </div>
      ) : null}

      <QuotationActions
        id={quotation.id}
        quotationNo={quotation.quotationNo}
        text={text}
        hasPhoto={!!photoUrl}
        madeOrder={!!quotation.orderId}
        priced={hasPrice}
      />
    </div>
  );
}

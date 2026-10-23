"use client";
// The owner's half of a quotation, on the quotation's own page.
//
// The seller wrote down what the customer asked for. This is the part only the
// owner can answer: what the piece will weigh in gold, whether it is set polki,
// a line per stone size, and the figure to tell the customer. The cost appears
// as he types, from the same code the stock book prices a finished piece with,
// so what he reads here is the sum the portal would do anyway.
//
// It can be filled in again. A customer argues about a price, so pressing the
// button a second time re-prices the quotation; the page above lists every
// pricing with who and when.
//
// The panel is shown to an admin and nobody else, and the route behind it
// refuses anybody else as well. Hiding it is a courtesy, not the rule.
//
// Written for a phone: one column, every box at least 48 pixels, and the stone
// lines read as cards rather than a table to scroll sideways.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Combo from "@/components/Combo";
import { findPrice, karatOf, money, trim, type PriceList } from "@/lib/priceList";
import { suggestCode } from "@/lib/stockBookConfig";
import {
  BLANK_QUOTE_LINE, QUOTE_SHAPES, priceQuotation, ratelessMetal,
  type QuotationLine,
} from "@/lib/quotationConfig";
import { readReply } from "@/lib/readReply";

export default function QuotationPricing({
  id,
  quotationNo,
  prices,
  goldDetails,
  // What is already on the record. Blank on one the seller has just written;
  // the figures he put on last time when he is pricing it again.
  goldWt: savedGoldWt,
  polkiLabour: savedPolki,
  lines: savedLines,
  quotedUsd: savedUsd,
  quotedInr: savedInr,
  priced,
}: {
  id: string;
  quotationNo: string;
  prices: PriceList;
  goldDetails: string;
  goldWt: string;
  polkiLabour: boolean;
  lines: QuotationLine[];
  quotedUsd?: number;
  quotedInr?: number;
  priced: boolean;
}) {
  const router = useRouter();
  const [goldWt, setGoldWt] = useState(savedGoldWt || "");
  const [polkiLabour, setPolkiLabour] = useState(!!savedPolki);
  const [lines, setLines] = useState<QuotationLine[]>(
    savedLines.length > 0 ? savedLines : [{ ...BLANK_QUOTE_LINE }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // What he decided to quote, once he has decided something. Until then the
  // boxes read the calculated figure, which is what "starts at the calculated
  // one" means: there is no empty box to wonder about.
  const [quoted, setQuoted] = useState({
    usd: savedUsd === undefined ? "" : String(savedUsd),
    inr: savedInr === undefined ? "" : String(savedInr),
  });
  const [quoteOwn, setQuoteOwn] = useState(
    savedUsd !== undefined || savedInr !== undefined
  );

  // Priced as it is typed, by the stock book's own pricing. The gold and the
  // labour are charged on the expected gold weight, because the stones are not
  // gold.
  const calc = useMemo(
    () => priceQuotation(prices, { goldWt, goldDetails, polkiLabour, lines }),
    [prices, goldWt, goldDetails, polkiLabour, lines]
  );

  const shownQuote = quoteOwn
    ? quoted
    : { usd: String(Math.round(calc.total.usd)), inr: String(Math.round(calc.total.inr)) };

  // Taking over the boxes fills both from the calculated figures first, so
  // changing the dollar price does not leave the rupee one blank.
  function editQuote(which: "usd" | "inr", value: string) {
    setQuoted((q) => {
      const from = quoteOwn
        ? q
        : {
            usd: String(Math.round(calc.total.usd)),
            inr: String(Math.round(calc.total.inr)),
          };
      return { ...from, [which]: value };
    });
    setQuoteOwn(true);
  }

  const setLine = (i: number, k: keyof QuotationLine, v: string) =>
    setLines((rows) =>
      rows.map((l, n) => {
        if (n !== i) return l;
        const next = { ...l, [k]: v };
        // The Product Code is what the rate hangs on, and it can be worked out
        // from the sieve or the shape — so it is offered as soon as there is
        // enough to go on, and left alone once it has been typed over. The
        // same rule, and the same function, as the stock book's own form.
        if (k !== "code" && (!l.code || l.code === suggestCode(prices, l))) {
          next.code = suggestCode(prices, next) || next.code;
        }
        return next;
      })
    );

  const addLine = () => setLines((rows) => [...rows, { ...BLANK_QUOTE_LINE }]);

  const dropLine = (i: number) =>
    setLines((rows) =>
      rows.length > 1 ? rows.filter((_, n) => n !== i) : [{ ...BLANK_QUOTE_LINE }]
    );

  const codes = useMemo(
    () => [...prices.round.map((r) => r.code), ...prices.fancy.map((p) => p.code)],
    [prices]
  );
  const sieves = useMemo(() => prices.round.map((r) => r.sieve).filter(Boolean), [prices]);

  // The complaint names the box, and the page puts the cursor in it. Focus
  // first and scroll second: on a phone focusing opens the keyboard, and doing
  // it this way round the last word is ours.
  function complain(message: string, box: string) {
    setError(message);
    const el = document.getElementById(box) as HTMLElement | null;
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  async function save() {
    setError("");
    if (!(Number(goldWt) > 0)) {
      complain("Enter the expected gold weight in grams.", "qp-goldwt");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/orders/quotations/${id}/price`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goldWt,
          polkiLabour,
          lines,
          // Both figures go up as they read on screen. A quotation keeps the
          // price that was given, so it does not move when a rate changes
          // later — that is the whole point of keeping it beside the
          // calculated one.
          quotedUsd: shownQuote.usd,
          quotedInr: shownQuote.inr,
        }),
      });
      await readReply(res, "Could not save the price on this quotation.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the price.");
    } finally {
      setSaving(false);
    }
  }

  const rateless = ratelessMetal(goldDetails);

  return (
    <section className="qt-owner no-print">
      <h2>{priced ? "Change the price" : "Put a price on it"}</h2>
      <p className="hint">
        {priced
          ? `${quotationNo} has a price on it already. Change it here and the` +
            " new one becomes the price. Every time it is priced is recorded above."
          : `${quotationNo} is waiting for a price. The seller wrote down what the` +
            " customer asked for; the stones, the gold weight and the figure are yours."}
      </p>

      <label className="field" htmlFor="qp-goldwt">
        <span>Expected gold weight (g) <em className="need">must be filled</em></span>
        <input
          id="qp-goldwt"
          value={goldWt}
          inputMode="decimal"
          onChange={(e) => setGoldWt(e.target.value)}
          placeholder="12.500"
        />
      </label>
      <p className="hint">
        The gold and the labour are both charged on this weight, at the{" "}
        {karatOf(goldDetails)}KT rate, which comes from the gold details the
        seller chose.
      </p>
      {rateless && (
        <p className="dia-note">
          The price list has no {rateless.toLowerCase()} rate, so this is worked
          out at the 14KT gold rate.
          <br />
          Put the real figure in the quoted price below.
        </p>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={polkiLabour}
          onChange={(e) => setPolkiLabour(e.target.checked)}
        />
        <span>Polki labour rate</span>
      </label>

      {/* One line per stone size, in the shape the stock book keeps them. The
          Product Code is what the rate hangs on, and it is offered from the
          sieve or the shape rather than looked up on a printed sheet. */}
      <div className="sb-lines qt-lines">
        <div className="sb-lines-head">
          <h2>One line per stone size</h2>
          <span className="jg-muted">
            {lines.filter((l) => l.code.trim()).length === 0
              ? "Nothing priced yet."
              : `${lines.length} ${lines.length === 1 ? "size" : "sizes"}`}
          </span>
        </div>
        <div className="jg-scroll">
          <table className="jg-table sb-table">
            <thead>
              <tr>
                <th className="jg-sr">#</th>
                <th>Shape</th><th>Sieve / Size</th>
                <th>Weight (cts)</th><th>Pcs</th>
                <th>Product Code</th>
                <th>Price ($)</th><th>Price (₹)</th>
                <th className="jg-sr" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const p = calc.lines[i];
                const hit = findPrice(prices, l.code);
                return (
                  <tr key={i} className={l.code && !hit ? "jg-short" : undefined}>
                    <td className="jg-sr">{i + 1}</td>
                    <td data-label="Shape">
                      <Combo value={l.shape} onChange={(v) => setLine(i, "shape", v)}
                        options={QUOTE_SHAPES} placeholder="Round" /></td>
                    <td data-label="Sieve / Size">
                      <Combo value={l.sieve} onChange={(v) => setLine(i, "sieve", v)}
                        options={sieves} placeholder="+6.5-11" /></td>
                    <td data-label="Weight (cts)">
                      <input inputMode="decimal" value={l.breakupWt}
                        onChange={(e) => setLine(i, "breakupWt", e.target.value)} /></td>
                    <td data-label="Pcs">
                      <input inputMode="numeric" value={l.pcs}
                        onChange={(e) => setLine(i, "pcs", e.target.value)} /></td>
                    <td data-label="Product Code">
                      <Combo value={l.code} onChange={(v) => setLine(i, "code", v)}
                        options={codes} placeholder="+6.5-11 : 01" /></td>
                    <td data-label="Price ($)" className="sb-num">{money(p?.diamond.usd ?? 0)}</td>
                    <td data-label="Price (₹)" className="sb-num">{money(p?.diamond.inr ?? 0)}</td>
                    <td className="jg-sr">
                      <button type="button" className="del" onClick={() => dropLine(i)}
                        title="Remove line" aria-label="Remove line">×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="pieces-actions">
          <button type="button" className="btn" onClick={addLine}>+ Add a stone size</button>
        </div>
        {calc.unknownCodes.length > 0 && (
          <p className="jg-mismatch">
            No price for {calc.unknownCodes.join(", ")} — that size is counted at
            nothing until the code is on the price list, so the total below is
            short.
          </p>
        )}
      </div>

      {/* What the piece comes to on the price list, as the stock book shows it.
          Per piece, however many pieces are being quoted for. */}
      <div className="sb-total qt-total">
        <div className="sb-total-grid">
          <span>Total diamond weight</span><b>{trim(calc.totalWeight, 3)} cts</b>
          <span>Total stones</span><b>{calc.totalPcs || "—"}</b>
          <span>Pointers</span><b>{trim(calc.pointer, 2) || "—"}</b>
        </div>
        <table className="sb-money">
          <thead><tr><th>Cost, per piece</th><th>$</th><th>₹</th></tr></thead>
          <tbody>
            <tr><td>Diamonds</td><td>{money(calc.diamond.usd)}</td><td>{money(calc.diamond.inr)}</td></tr>
            <tr><td>Gold</td><td>{money(calc.gold.usd)}</td><td>{money(calc.gold.inr)}</td></tr>
            <tr><td>Labour</td><td>{money(calc.labour.usd)}</td><td>{money(calc.labour.inr)}</td></tr>
            <tr className="sb-grand"><td>Calculated total</td><td>{money(calc.total.usd)}</td><td>{money(calc.total.inr)}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="qt-quote">
        <h2>The price to quote</h2>
        <p className="hint">
          The figures above are what the piece costs on the price list. These two
          are what the customer is told, for one piece.
          <br />
          They start at the calculated figures. Change either one and the
          quotation keeps what you typed.
        </p>
        <div className="two">
          <label className="field" htmlFor="qp-usd">
            <span>Quoted price, per piece ($)</span>
            <input
              id="qp-usd"
              value={shownQuote.usd}
              inputMode="decimal"
              onChange={(e) => editQuote("usd", e.target.value)}
            />
          </label>
          <label className="field" htmlFor="qp-inr">
            <span>Quoted price, per piece (₹)</span>
            <input
              id="qp-inr"
              value={shownQuote.inr}
              inputMode="decimal"
              onChange={(e) => editQuote("inr", e.target.value)}
            />
          </label>
        </div>
        {quoteOwn ? (
          <div className="pieces-actions">
            <button
              type="button"
              className="btn"
              onClick={() => { setQuoteOwn(false); setQuoted({ usd: "", inr: "" }); }}
            >
              Go back to the calculated price
            </button>
          </div>
        ) : (
          <p className="dia-note">
            Both boxes are following the calculated price. Nothing has been
            changed by hand.
          </p>
        )}
      </div>

      <div className="pieces-actions qt-act">
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving}
          onClick={save}
        >
          {saving
            ? "Saving the price…"
            : priced ? "Save the new price" : "Save the price"}
        </button>
      </div>
      {error && <p className="save-error">{error}</p>}
    </section>
  );
}

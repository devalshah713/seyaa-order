"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Combo from "@/components/Combo";
import { todayInput } from "@/lib/memoFormat";
import {
  BLANK_LINE, CATEGORIES, GOLD_DETAILS, LOCATIONS, PARTIES, SHAPES,
  hasContent, suggestCode,
  type NewStockEntry, type StockEntry, type StockLine,
} from "@/lib/stockBookConfig";
import {
  findPrice, karatOf, money, pricePiece, trim,
  type PriceList,
} from "@/lib/priceList";
import type { StockSeedPiece } from "@/lib/stockBookStore";

// Taking a finished piece into stock, and pricing it.
//
// The piece comes back from the workshop with its jangad entries already
// saying what was studded into it, so the diamonds are fetched rather than
// counted again. What is left is what only the person holding the piece knows:
// its weight on the scale, its size, and where it is going.

type Props = {
  prices: PriceList;
  pieces: StockSeedPiece[];
  stockNo: string;
  entry?: StockEntry; // editing an entry already in the book
};

type Draft = NewStockEntry;

const blank = (stockNo: string): Draft => ({
  stockNo,
  date: todayInput(),
  design: "", designNo: "", category: "", subCategory: "", subSubCategory: "",
  location: "INDIA", goldDetails: "", inchSize: "", grossWt: "", netWt: "",
  partyName: "SEYAA FACTORY", polkiLabour: false,
  lines: [{ ...BLANK_LINE }],
  comments: "",
});

export default function StockEntryForm({ prices, pieces, stockNo, entry }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() =>
    entry ? { ...entry, lines: entry.lines.length ? entry.lines : [{ ...BLANK_LINE }] }
          : blank(stockNo)
  );
  const [from, setFrom] = useState(entry ? entry.designNo : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const setLine = (i: number, k: keyof StockLine, v: string) =>
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l, n) => {
        if (n !== i) return l;
        const next = { ...l, [k]: v };
        // The Product Code is what the price hangs on, and it can be worked out
        // from the sieve or the shape — so it is offered as soon as there is
        // enough to go on, and left alone once it has been typed over.
        if (k !== "code" && (!l.code || l.code === suggestCode(prices, l))) {
          next.code = suggestCode(prices, next) || next.code;
        }
        return next;
      }),
    }));

  const addLine = () =>
    setDraft((d) => ({ ...d, lines: [...d.lines, { ...BLANK_LINE }] }));

  const dropLine = (i: number) =>
    setDraft((d) => ({
      ...d,
      lines: d.lines.length > 1 ? d.lines.filter((_, n) => n !== i) : [{ ...BLANK_LINE }],
    }));

  // Pieces the register has but the book does not — what is waiting to come in.
  const waiting = useMemo(() => pieces.filter((p) => !p.stockCode), [pieces]);

  function take(p: StockSeedPiece) {
    setFrom(p.pieceNo);
    setDraft((d) => ({
      ...d,
      design: p.design || p.product || d.design,
      designNo: p.pieceNo,
      category: p.category || d.category,
      subCategory: p.subCategory || d.subCategory,
      goldDetails: p.goldDetails || d.goldDetails,
      lines: p.lines.length ? p.lines.map((l) => ({ ...l })) : [{ ...BLANK_LINE }],
      jangadIds: p.jangadIds,
      pdId: p.pdId,
      pdNo: p.pdNo,
    }));
  }

  // Priced as you type, from the same code the server prices it with.
  const priced = useMemo(
    () => pricePiece(prices, {
      netWt: draft.netWt,
      goldDetails: draft.goldDetails,
      polkiLabour: draft.polkiLabour,
      lines: draft.lines,
    }),
    [prices, draft.netWt, draft.goldDetails, draft.polkiLabour, draft.lines]
  );

  const codes = useMemo(
    () => [...prices.round.map((r) => r.code), ...prices.fancy.map((f) => f.code)],
    [prices]
  );
  const sieves = useMemo(() => prices.round.map((r) => r.sieve).filter(Boolean), [prices]);

  const mix = draft.lines.filter(hasContent).length > 1;

  async function save() {
    if (!draft.designNo.trim() && !draft.design.trim()) {
      setError("A stock entry needs at least a design number.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const res = await fetch(
        entry ? `/api/stockbook/${entry.id}` : "/api/stockbook",
        {
          method: entry ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Could not save (${res.status}).`);
      router.push(`/stockbook?q=${encodeURIComponent(draft.designNo || draft.stockNo)}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the entry.");
      setSaving(false);
    }
  }

  return (
    <>
      {!entry && (
        <section className="sb-pick">
          <div className="sb-pick-head">
            <span>Pieces back from the workshop</span>
            <Link href="/stockbook/prices" className="linkbtn">Price list</Link>
          </div>
          {waiting.length === 0 ? (
            <p className="pieces-hint">
              Every piece in the jangad register is already in the book. You can
              still fill an entry in by hand below.
            </p>
          ) : (
            <>
              <div className="sb-piece-list">
                {waiting.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    className={["sb-piece", from === p.pieceNo ? "on" : ""].filter(Boolean).join(" ")}
                    onClick={() => take(p)}
                  >
                    <b>{p.pieceNo}</b>
                    <small>
                      {[p.product, p.mfgName].filter(Boolean).join(" · ") || "—"}
                    </small>
                    <small>
                      {p.lines.length} diamond {p.lines.length === 1 ? "size" : "sizes"}
                    </small>
                  </button>
                ))}
              </div>
              <p className="pieces-hint">
                What was studded into the piece comes across as its diamond lines.
                Weigh the piece and the rest is worked out.
              </p>
            </>
          )}
        </section>
      )}

      {error && <p className="save-error">{error}</p>}

      <section className="sb-form">
        <div className="three">
          <label className="field"><span>Sr. No.</span>
            <input value={draft.stockNo} onChange={(e) => set("stockNo", e.target.value)} /></label>
          <label className="field"><span>Date</span>
            <input type="date" value={draft.date} onChange={(e) => set("date", e.target.value)} /></label>
          <label className="field"><span>Design Number</span>
            <input value={draft.designNo} onChange={(e) => set("designNo", e.target.value)}
              placeholder="SN-BR-AMF-10CT-63" /></label>
        </div>

        <label className="field"><span>Design</span>
          <input value={draft.design} onChange={(e) => set("design", e.target.value)}
            placeholder="50PTS EACH OVAL BEZEL TENNIS BRACELET" /></label>

        <div className="three">
          <label className="field"><span>Category</span>
            <Combo value={draft.category} onChange={(v) => set("category", v)}
              options={CATEGORIES} placeholder="BRACELET" /></label>
          <label className="field"><span>Sub-Category</span>
            <input value={draft.subCategory} onChange={(e) => set("subCategory", e.target.value)} /></label>
          <label className="field"><span>Sub-Sub-Category</span>
            <input value={draft.subSubCategory} onChange={(e) => set("subSubCategory", e.target.value)} /></label>
        </div>

        <div className="three">
          <label className="field"><span>Location</span>
            <Combo value={draft.location} onChange={(v) => set("location", v)}
              options={LOCATIONS} placeholder="INDIA" /></label>
          <label className="field"><span>Gold Details</span>
            <Combo value={draft.goldDetails} onChange={(v) => set("goldDetails", v)}
              options={GOLD_DETAILS} placeholder="14K WHITE" /></label>
          <label className="field"><span>Inch / Size</span>
            <input value={draft.inchSize} onChange={(e) => set("inchSize", e.target.value)} /></label>
        </div>

        <div className="three">
          <label className="field"><span>Gross Weight (g)</span>
            <input inputMode="decimal" value={draft.grossWt}
              onChange={(e) => set("grossWt", e.target.value)} /></label>
          <label className="field"><span>Net Weight (g)</span>
            <input inputMode="decimal" value={draft.netWt}
              onChange={(e) => set("netWt", e.target.value)} /></label>
          <label className="field"><span>Party Name</span>
            <Combo value={draft.partyName} onChange={(v) => set("partyName", v)}
              options={PARTIES} placeholder="SEYAA FACTORY" /></label>
        </div>
        <p className="pieces-hint">
          Gold and labour are charged on the net weight — the stones are not
          gold — at the {karatOf(draft.goldDetails)}KT rate, which comes from
          what the Gold Details say.
        </p>
        <label className="check">
          <input type="checkbox" checked={draft.polkiLabour}
            onChange={(e) => set("polkiLabour", e.target.checked)} />
          <span>Polki labour rate</span>
        </label>
      </section>

      <section className="sb-lines">
        <div className="sb-lines-head">
          <h2>Diamonds</h2>
          <span className="jg-muted">
            {mix ? "More than one size — this piece is a MIX on the stock sheet." : "One size."}
          </span>
        </div>
        <div className="jg-scroll">
          <table className="jg-table sb-table">
            <thead>
              <tr>
                <th className="jg-sr">#</th>
                <th>Weight (cts)</th><th>Pcs</th><th>Shape</th>
                <th>Sieve / Size</th><th>Product Code</th>
                <th>Pointers</th><th>Price ($)</th><th>Price (₹)</th>
                <th className="jg-sr" />
              </tr>
            </thead>
            <tbody>
              {draft.lines.map((l, i) => {
                const p = priced.lines[i];
                const hit = findPrice(prices, l.code);
                return (
                  <tr key={i} className={l.code && !hit ? "jg-short" : undefined}>
                    <td className="jg-sr">{i + 1}</td>
                    <td data-label="Weight (cts)">
                      <input inputMode="decimal" value={l.breakupWt}
                        onChange={(e) => setLine(i, "breakupWt", e.target.value)} /></td>
                    <td data-label="Pcs">
                      <input inputMode="numeric" value={l.pcs}
                        onChange={(e) => setLine(i, "pcs", e.target.value)} /></td>
                    <td data-label="Shape">
                      <Combo value={l.shape} onChange={(v) => setLine(i, "shape", v)}
                        options={SHAPES} placeholder="RD" /></td>
                    <td data-label="Sieve / Size">
                      <Combo value={l.sieve} onChange={(v) => setLine(i, "sieve", v)}
                        options={sieves} placeholder="+6.5-11" /></td>
                    <td data-label="Product Code">
                      <Combo value={l.code} onChange={(v) => setLine(i, "code", v)}
                        options={codes} placeholder="+6.5-11 : 01" /></td>
                    <td data-label="Pointers" className="sb-num">{trim(p?.pointer ?? null, 2) || "—"}</td>
                    <td data-label="Price ($)" className="sb-num">{money(p?.diamond.usd ?? 0)}</td>
                    <td data-label="Price (₹)" className="sb-num">{money(p?.diamond.inr ?? 0)}</td>
                    <td className="jg-sr">
                      <button className="del" onClick={() => dropLine(i)}
                        title="Remove line" aria-label="Remove line">×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="pieces-actions">
          <button type="button" className="btn" onClick={addLine}>+ Add a diamond size</button>
        </div>
        {priced.unknownCodes.length > 0 && (
          <p className="jg-mismatch">
            No price for {priced.unknownCodes.join(", ")} — that size is counted
            at nothing until the code is on the price list.{" "}
            <Link href="/stockbook/prices" className="linkbtn">Open the price list</Link>
          </p>
        )}
      </section>

      <section className="sb-total">
        <div className="sb-total-grid">
          <span>Total diamond weight</span><b>{trim(priced.totalWeight, 3)} cts</b>
          <span>Total stones</span><b>{priced.totalPcs || "—"}</b>
          <span>Pointers</span><b>{trim(priced.pointer, 2) || "—"}</b>
        </div>
        <table className="sb-money">
          <thead><tr><th /><th>$</th><th>₹</th></tr></thead>
          <tbody>
            <tr><td>Diamonds</td><td>{money(priced.diamond.usd)}</td><td>{money(priced.diamond.inr)}</td></tr>
            <tr><td>Gold</td><td>{money(priced.gold.usd)}</td><td>{money(priced.gold.inr)}</td></tr>
            <tr><td>Labour</td><td>{money(priced.labour.usd)}</td><td>{money(priced.labour.inr)}</td></tr>
            <tr className="sb-grand"><td>Total</td><td>{money(priced.total.usd)}</td><td>{money(priced.total.inr)}</td></tr>
          </tbody>
        </table>
      </section>

      <label className="field"><span>Comments</span>
        <textarea rows={2} value={draft.comments}
          onChange={(e) => set("comments", e.target.value)} /></label>

      <div className="pieces-actions">
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : entry ? "Save changes" : "Take into stock"}
        </button>
        <Link href="/stockbook" className="btn">Cancel</Link>
      </div>
    </>
  );
}

"use client";
// The one place a quotation is written.
//
// A customer asks what a piece would cost. What is asked for here is what the
// price needs and nothing else: the gold it will come out at, the purity, the
// labour, and a line per stone size. The figures appear as it is typed, from
// the same code the server prices it with on the way in, so what he reads out
// to the customer is what gets saved.
//
// One box matters more than the rest. The calculated total is what the piece
// costs on the price list; what he tells a customer may be rounder, or higher,
// or a favour. So the quoted figure starts at the calculated one and can be
// written over, both are kept, and the screen says plainly which is which.
//
// Written for a phone: one column, every box at least 48 pixels, and the
// diamond lines read as cards rather than a table to scroll sideways.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Combo from "@/components/Combo";
import Picker from "@/components/Picker";
import { DIA_CERTIFICATIONS, GOLD_DETAILS, todayInput } from "@/lib/memoFormat";
import { findPrice, karatOf, money, trim, type PriceList } from "@/lib/priceList";
import { suggestCode } from "@/lib/stockBookConfig";
import {
  BLANK_QUOTE_LINE, QUOTE_SHAPES, priceQuotation, ratelessMetal,
  type QuotationLine,
} from "@/lib/quotationConfig";
import { compressImage, photoSrc, uploadToCloudinary } from "@/lib/cloudinary";
import { readReply } from "@/lib/readReply";

const BLANK = {
  date: todayInput(),
  customerName: "",
  productName: "",
  category: "",
  subCategory: "",
  subSubCategory: "",
  goldDetails: "",
  goldWt: "",
  polkiLabour: false,
  size: "",
  pcs: "1",
  diaCertification: "",
  notes: "",
  photoPath: "",
  photoPublicId: "",
};

type Field = keyof typeof BLANK;

export default function QuotationForm({
  prices,
  nextNo,
}: {
  prices: PriceList;
  nextNo: string;
}) {
  const router = useRouter();
  const [f, setF] = useState(BLANK);
  const [lines, setLines] = useState<QuotationLine[]>([{ ...BLANK_QUOTE_LINE }]);
  const [categories, setCategories] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // What he decided to quote, once he has decided something. Until then the
  // boxes read the calculated figure, which is what "starts at the calculated
  // one" means: there is no empty box to wonder about.
  const [quoted, setQuoted] = useState({ usd: "", inr: "" });
  const [quoteOwn, setQuoteOwn] = useState(false);

  const set = <K extends Field>(k: K, v: (typeof BLANK)[K]) =>
    setF((s) => ({ ...s, [k]: v }));

  // The category list is the admin's, so it is read rather than written in
  // here. A list that has not arrived yet leaves the box empty and says so.
  useEffect(() => {
    let off = false;
    fetch("/api/parties?kinds=category")
      .then((r) => (r.ok ? r.json() : { lists: {} }))
      .then((d) => {
        if (off) return;
        const rows = (d.lists?.category || []) as { name: string }[];
        setCategories(rows.map((e) => e.name));
      })
      .catch(() => {});
    return () => { off = true; };
  }, []);

  // Priced as it is typed, by the stock book's own pricing. The gold and the
  // labour are charged on the expected gold weight, because the stones are not
  // gold.
  const priced = useMemo(
    () => priceQuotation(prices, {
      goldWt: f.goldWt,
      goldDetails: f.goldDetails,
      polkiLabour: f.polkiLabour,
      lines,
    }),
    [prices, f.goldWt, f.goldDetails, f.polkiLabour, lines]
  );

  // The figures in the two quoted boxes: his own, or the calculated ones.
  const shownQuote = quoteOwn
    ? quoted
    : { usd: String(Math.round(priced.total.usd)), inr: String(Math.round(priced.total.inr)) };

  // Taking over the boxes fills both from the calculated figures first, so
  // changing the dollar price does not leave the rupee one blank.
  function editQuote(which: "usd" | "inr", value: string) {
    setQuoted((q) => {
      const from = quoteOwn
        ? q
        : {
            usd: String(Math.round(priced.total.usd)),
            inr: String(Math.round(priced.total.inr)),
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

  async function pickPhoto(file: File) {
    setError("");
    setUploading(true);
    try {
      // Straight from this browser to Cloudinary, exactly as an order's picture
      // goes. Shrunk first because a phone photo is several megabytes.
      const shot = await uploadToCloudinary(await compressImage(file), file.name);
      setF((cur) => ({
        ...cur, photoPath: shot.secure_url, photoPublicId: shot.public_id,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The picture did not upload. Try again.");
    } finally {
      setUploading(false);
    }
  }

  // The complaint names the box, and the page puts the cursor in it. Focus
  // first and scroll second: on a phone focusing opens the keyboard, and doing
  // it this way round the last word is ours.
  function complain(message: string, box: string) {
    setError(message);
    const el = document.getElementById(box) as HTMLElement | null;
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function firstProblem(): [string, string] | null {
    if (!f.customerName.trim()) return ["Write the customer's name, in words.", "q-customer"];
    if (!f.productName.trim()) return ["Write what is being made, in words.", "q-made"];
    if (!f.category) return ["Choose a category.", "q-category"];
    if (!f.goldDetails) return ["Choose the gold details.", "q-gold"];
    if (!(Number(f.goldWt) > 0)) {
      return ["Enter the expected gold weight in grams.", "q-goldwt"];
    }
    if (!(Math.round(Number(f.pcs)) >= 1)) {
      return ["Enter the quantity in pieces. It must be a whole number, at least 1.", "q-pcs"];
    }
    if (!f.size.trim()) return ["Enter the size, for example 7 INCH or US7.", "q-size"];
    if (!f.diaCertification) {
      return ["Choose whether the diamonds are certified.", "q-certi"];
    }
    return null;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const problem = firstProblem();
    if (problem) { complain(problem[0], problem[1]); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/orders/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...f,
          pcs: f.pcs,
          lines,
          // Both figures go up as they read on screen. A quotation keeps the
          // price he gave, so it does not move when a rate changes later —
          // that is the whole point of keeping it beside the calculated one.
          quotedUsd: shownQuote.usd,
          quotedInr: shownQuote.inr,
        }),
      });
      const data = await readReply(res, "Could not save the quotation.");
      const quotation = data.quotation as { id?: string } | undefined;
      if (!quotation?.id) {
        throw new Error(
          "The quotation was saved, but this page could not open it. Find it on the quotations list."
        );
      }
      router.push(`/orders/quotations/${quotation.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the quotation.");
      setSaving(false);
    }
  }

  const photoUrl = photoSrc(f.photoPath);
  const rateless = ratelessMetal(f.goldDetails);

  return (
    <form className="ord-form qt-form" onSubmit={save}>
      <fieldset className="group">
        <legend>Who it is for</legend>
        <label className="field" htmlFor="q-customer">
          <span>Customer name <em className="need">must be filled</em></span>
          <input
            id="q-customer"
            value={f.customerName}
            onChange={(e) => set("customerName", e.target.value)}
            placeholder="Mr Shah, Dubai"
            autoFocus
          />
        </label>
        <p className="group-hint">
          Write the name in words. This is the person asking for the price, not a
          party from a list.
          <br />
          This quotation will be {nextNo}.
        </p>
        <label className="field" htmlFor="q-date">
          <span>Date</span>
          <input
            id="q-date"
            type="date"
            value={f.date}
            onChange={(e) => set("date", e.target.value)}
          />
        </label>
      </fieldset>

      <fieldset className="group">
        <legend>What is being made</legend>
        <label className="field" htmlFor="q-made">
          <span>In words <em className="need">must be filled</em></span>
          <input
            id="q-made"
            value={f.productName}
            onChange={(e) => set("productName", e.target.value)}
            placeholder="50PTS EACH OVAL BEZEL TENNIS BRACELET"
          />
        </label>
        <label className="field" htmlFor="q-category">
          <span>Category <em className="need">must be filled</em></span>
          <Picker
            id="q-category"
            value={f.category}
            onChange={(v) => set("category", v)}
            options={categories}
            prompt="Choose a category…"
          />
        </label>
        {categories.length === 0 && (
          <p className="dia-note">
            Nothing on the category list yet — an admin adds them under Lists.
          </p>
        )}
        <div className="two">
          <label className="field" htmlFor="q-sub">
            <span>Sub-category <em>(optional)</em></span>
            <input
              id="q-sub"
              value={f.subCategory}
              onChange={(e) => set("subCategory", e.target.value)}
              placeholder="Type anything"
            />
          </label>
          <label className="field" htmlFor="q-subsub">
            <span>Sub-sub-category <em>(optional)</em></span>
            <input
              id="q-subsub"
              value={f.subSubCategory}
              onChange={(e) => set("subSubCategory", e.target.value)}
              placeholder="Type anything"
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="group">
        <legend>Gold, size and quantity</legend>
        <label className="field" htmlFor="q-gold">
          <span>Gold details <em className="need">must be filled</em></span>
          <Picker
            id="q-gold"
            value={f.goldDetails}
            onChange={(v) => set("goldDetails", v)}
            options={GOLD_DETAILS}
            prompt="Choose the gold…"
          />
        </label>
        <label className="field" htmlFor="q-goldwt">
          <span>Expected gold weight (g) <em className="need">must be filled</em></span>
          <input
            id="q-goldwt"
            value={f.goldWt}
            inputMode="decimal"
            onChange={(e) => set("goldWt", e.target.value)}
            placeholder="12.500"
          />
        </label>
        <p className="group-hint">
          The gold and the labour are both charged on this weight, at the{" "}
          {karatOf(f.goldDetails)}KT rate, which comes from the gold details.
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
            checked={f.polkiLabour}
            onChange={(e) => set("polkiLabour", e.target.checked)}
          />
          <span>Polki labour rate</span>
        </label>
        <div className="two">
          <label className="field" htmlFor="q-pcs">
            <span>Quantity in pieces <em className="need">must be filled</em></span>
            <input
              id="q-pcs"
              value={f.pcs}
              inputMode="numeric"
              onChange={(e) => set("pcs", e.target.value)}
              placeholder="1"
            />
          </label>
          <label className="field" htmlFor="q-size">
            <span>Size <em className="need">must be filled</em></span>
            <input
              id="q-size"
              value={f.size}
              onChange={(e) => set("size", e.target.value)}
              placeholder="7 INCH or US7"
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="group">
        <legend>Diamonds</legend>
        <label className="field" htmlFor="q-certi">
          <span>Certified or not <em className="need">must be filled</em></span>
          <select
            id="q-certi"
            value={f.diaCertification}
            onChange={(e) => set("diaCertification", e.target.value)}
          >
            <option value="">Choose…</option>
            {DIA_CERTIFICATIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>
        <p className="group-hint">
          A design is either certified or it is not, and the factory has to be
          told which.
          <br />
          It does not change the price.
        </p>
      </fieldset>

      {/* One line per stone size, in the shape the stock book keeps them. The
          Product Code is what the rate hangs on, and it is offered from the
          sieve or the shape rather than looked up on a printed sheet. */}
      <section className="sb-lines qt-lines">
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
                const p = priced.lines[i];
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
        {priced.unknownCodes.length > 0 && (
          <p className="jg-mismatch">
            No price for {priced.unknownCodes.join(", ")} — that size is counted at
            nothing until the code is on the price list, so the total below is
            short.
          </p>
        )}
      </section>

      {/* What the piece comes to on the price list, as the stock book shows it.
          Per piece, however many pieces are being quoted for. */}
      <section className="sb-total qt-total">
        <div className="sb-total-grid">
          <span>Total diamond weight</span><b>{trim(priced.totalWeight, 3)} cts</b>
          <span>Total stones</span><b>{priced.totalPcs || "—"}</b>
          <span>Pointers</span><b>{trim(priced.pointer, 2) || "—"}</b>
        </div>
        <table className="sb-money">
          <thead><tr><th>Cost, per piece</th><th>$</th><th>₹</th></tr></thead>
          <tbody>
            <tr><td>Diamonds</td><td>{money(priced.diamond.usd)}</td><td>{money(priced.diamond.inr)}</td></tr>
            <tr><td>Gold</td><td>{money(priced.gold.usd)}</td><td>{money(priced.gold.inr)}</td></tr>
            <tr><td>Labour</td><td>{money(priced.labour.usd)}</td><td>{money(priced.labour.inr)}</td></tr>
            <tr className="sb-grand"><td>Calculated total</td><td>{money(priced.total.usd)}</td><td>{money(priced.total.inr)}</td></tr>
          </tbody>
        </table>
      </section>

      <fieldset className="group qt-quote">
        <legend>The price you are quoting</legend>
        <p className="group-hint">
          The figures above are what the piece costs on the price list. These two
          are what you are telling the customer, for one piece.
          <br />
          They start at the calculated figures. Change either one and the
          quotation keeps what you typed.
        </p>
        <div className="two">
          <label className="field" htmlFor="q-usd">
            <span>Quoted price, per piece ($)</span>
            <input
              id="q-usd"
              value={shownQuote.usd}
              inputMode="decimal"
              onChange={(e) => editQuote("usd", e.target.value)}
            />
          </label>
          <label className="field" htmlFor="q-inr">
            <span>Quoted price, per piece (₹)</span>
            <input
              id="q-inr"
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
      </fieldset>

      <fieldset className="group">
        <legend>Reference picture</legend>
        <p className="group-hint">
          Optional. A customer ringing up for a price has often not sent anything
          yet.
          <br />
          An order needs one, so a picture added here saves retyping the whole
          thing later.
        </p>
        {f.photoPath ? (
          <div className="photo-prev ord-prev">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt="Reference" />
            <div className="prev-side">
              <p className="pic-done">Picture added.</p>
              <div className="prev-btns">
                <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
                  Replace
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setF((cur) => ({ ...cur, photoPath: "", photoPublicId: "" }))}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div
            id="q-picture"
            className={`photo-drop ord-drop${uploading ? " is-busy" : ""}`}
            role="button"
            tabIndex={0}
            aria-busy={uploading}
            onClick={() => { if (!uploading) fileRef.current?.click(); }}
            onKeyDown={(e) => {
              if (!uploading && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                fileRef.current?.click();
              }
            }}
          >
            {uploading ? "Uploading the picture…" : "Take a photo, or choose one from the phone"}
          </div>
        )}
        <input
          ref={fileRef} type="file" accept="image/*" hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void pickPhoto(file);
            e.target.value = "";
          }}
        />
      </fieldset>

      <fieldset className="group">
        <legend>Anything else</legend>
        <label className="field" htmlFor="q-notes">
          <span>Notes <em>(optional)</em></span>
          <textarea
            id="q-notes"
            value={f.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Customer wants it light weight. Bezel setting only."
          />
        </label>
      </fieldset>

      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={saving || uploading}>
          {saving ? "Saving…" : "Save the quotation"}
        </button>
        <Link href="/orders/quotations" className="btn">Cancel</Link>
      </div>
      {error && <p className="save-error">{error}</p>}
      <p className="hint">
        The quotation number, the time and your username are added by the portal.
        <br />
        If the customer says yes, one button on the saved quotation turns it into
        an order.
      </p>
    </form>
  );
}

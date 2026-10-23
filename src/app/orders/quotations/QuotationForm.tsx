"use client";
// The seller raising a quotation, which is where one starts.
//
// He wants to know what a piece would cost, so he writes down what he has in
// hand: the piece, the picture, and his own figures — how many grams of gold,
// how many carats of diamond, which shapes, which sieves. That is exactly the
// WhatsApp message he sends today, and this is it on a form.
//
// Not one of his figures is compulsory. They are his best guess at what the
// piece takes, not a measurement, and a form that refuses him until he knows
// the sieve of every stone is a form he gives up on and goes back to WhatsApp.
// So the gaps are allowed and the form says so in one line.
//
// He never sees a price. There is no cost breakdown on this form, no calculated
// total and no price box, and his browser is not sent the price list — only the
// code book, which is the sieve names, the shapes and the codes with no rate in
// it, so the Product Code can still be offered rather than hunted for.
//
// What happens next is the owner reading his figures, correcting the ones that
// are wrong, and putting the price on. Saving that is the approval, and then the
// quotation comes back here with the price on it.
//
// Written for a phone: one column, every box at least 48 pixels, and the stone
// lines read as cards rather than a table to scroll sideways.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Combo from "@/components/Combo";
import Picker from "@/components/Picker";
import { DIA_CERTIFICATIONS, GOLD_DETAILS, todayInput } from "@/lib/memoFormat";
import { suggestCodeFrom, type CodeBook } from "@/lib/stockBookConfig";
import {
  BLANK_QUOTE_LINE, QUOTE_SHAPES, quoteCarats, quoteStones,
  type QuotationLine,
} from "@/lib/quotationConfig";
import { compressImage, photoSrc, uploadToCloudinary } from "@/lib/cloudinary";
import { readReply } from "@/lib/readReply";

const BLANK = {
  // Filled in when the form opens, not when the file is loaded: the date has to
  // be the browser's today, and the server renders this page too.
  date: "",
  customerName: "",
  productName: "",
  category: "",
  subCategory: "",
  subSubCategory: "",
  goldDetails: "",
  goldWt: "",
  size: "",
  pcs: "1",
  diaCertification: "",
  notes: "",
  photoPath: "",
  photoPublicId: "",
};

type Field = keyof typeof BLANK;

export default function QuotationForm({
  nextNo,
  codeBook,
}: {
  nextNo: string;
  codeBook: CodeBook;
}) {
  const router = useRouter();
  const [f, setF] = useState(() => ({ ...BLANK, date: todayInput() }));
  const [lines, setLines] = useState<QuotationLine[]>([{ ...BLANK_QUOTE_LINE }]);
  const [categories, setCategories] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const setLine = (i: number, k: keyof QuotationLine, v: string) =>
    setLines((rows) =>
      rows.map((l, n) => {
        if (n !== i) return l;
        const next = { ...l, [k]: v };
        // The Product Code is what the rate hangs on, and it can be worked out
        // from the sieve or the shape — so it is offered as soon as there is
        // enough to go on, and left alone once it has been typed over. The same
        // rule, and the same function, as the stock book's own form, reading
        // the code book instead of the price list.
        if (k !== "code" && (!l.code || l.code === suggestCodeFrom(codeBook, l))) {
          next.code = suggestCodeFrom(codeBook, next) || next.code;
        }
        return next;
      })
    );

  const addLine = () => setLines((rows) => [...rows, { ...BLANK_QUOTE_LINE }]);

  const dropLine = (i: number) =>
    setLines((rows) =>
      rows.length > 1 ? rows.filter((_, n) => n !== i) : [{ ...BLANK_QUOTE_LINE }]
    );

  const sieves = useMemo(
    () => codeBook.sieves.map((s) => s.sieve).filter(Boolean),
    [codeBook]
  );

  // The carats and the stones he has written, added up and shown back. Not a
  // price: a seller checking he has typed what he meant to.
  const carats = quoteCarats(lines);
  const stones = quoteStones(lines);

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
        body: JSON.stringify({ ...f, pcs: f.pcs, lines }),
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
          <span>Expected gold weight in grams <em>(optional)</em></span>
          <input
            id="q-goldwt"
            value={f.goldWt}
            inputMode="decimal"
            onChange={(e) => set("goldWt", e.target.value)}
            placeholder="12.500"
          />
        </label>
        <p className="group-hint">
          Your own figure, as near as you know it. The owner checks it and
          corrects it if it is out.
        </p>
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

      {/* One line per stone size, in the shape the stock book keeps them. His
          figures, not measurements: he fills in what he has and leaves the rest.
          The Product Code is offered from the sieve or the shape so he does not
          look one up on a printed sheet, and there is no price column, because
          there is no price on this form. */}
      <section className="sb-lines qt-lines">
        <div className="sb-lines-head">
          <h2>The diamonds, one line per size</h2>
          <span className="jg-muted">
            {carats > 0 || stones > 0
              ? `${carats.toFixed(2)} cts · ${stones} stones`
              : "Nothing written yet."}
          </span>
        </div>
        <p className="group-hint">
          Write what you have. Every box here can be left empty, and a line you
          have not filled in is simply not saved.
        </p>
        <div className="jg-scroll">
          <table className="jg-table sb-table">
            <thead>
              <tr>
                <th className="jg-sr">#</th>
                <th>Shape</th><th>Sieve / Size</th>
                <th>Weight (cts)</th><th>Pcs</th>
                <th>Product Code</th>
                <th className="jg-sr" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
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
                      options={codeBook.codes} placeholder="+6.5-11 : 01" /></td>
                  <td className="jg-sr">
                    <button type="button" className="del" onClick={() => dropLine(i)}
                      title="Remove line" aria-label="Remove line">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pieces-actions">
          <button type="button" className="btn" onClick={addLine}>+ Add a stone size</button>
        </div>
      </section>

      <fieldset className="group">
        <legend>Reference picture</legend>
        <p className="group-hint">
          Optional, though it is usually the first thing you have.
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
        This goes to the owner for approval. He checks your figures, corrects
        anything that is out, and puts the price on it.
        <br />
        When he has, it shows as priced on the Quotations list. Open it there and
        read the price to the customer.
      </p>
    </form>
  );
}

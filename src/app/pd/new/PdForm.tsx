"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PdSheetView from "@/components/PdSheetView";
import Combo from "@/components/Combo";
import DiamondSizePicker from "@/components/DiamondSizePicker";
import Picker from "@/components/Picker";
import { todayInput } from "@/lib/memoFormat";
import {
  PRODUCTS, CATEGORIES, SUB_CATEGORIES, TYPES, DIA_QUALITIES,
  GOLD_PURITIES, GOLD_COLORS, ZONES, LOCKS, ORDER_TYPES, sizeLabel,
  DEFAULT_DIA_QUALITY,
  BLANK_DIA_LINE, formatDiaLines, shapesFromLines, type DiaLine,
} from "@/lib/pdConfig";
import {
  parseDesignNo, pieceCount, pieceNumbers, joinDesignNo, splitDesignNo, splitPiece,
  MAX_PIECES,
} from "@/lib/designNo";

export type PdInitial = {
  id: string;
  pdNo: string;
  photoPath: string;
  sku: string;
  product: string; category: string; subCategory: string; type: string;
  diaQuality: string; goldWeight: string; locks: string; orderType: string; assignedDate: string;
  assignedTo: string; size: string; diaShape: string; zone: string;
  goldPurity: string; goldColor: string; priceRange: string; diaWeightPointers: string;
  quantity: string; orderBy: string; deliveryDate: string;
  pdMerchandiser: string; remarks: string;
  diaLines?: DiaLine[];
};

const BLANK: Omit<PdInitial, "id" | "pdNo"> = {
  photoPath: "", sku: "",
  product: "", category: "", subCategory: "", type: "",
  diaQuality: DEFAULT_DIA_QUALITY, goldWeight: "", locks: "", orderType: "Stock", assignedDate: "",
  assignedTo: "", size: "", diaShape: "", zone: "USA",
  goldPurity: "14KT", goldColor: "White Gold", priceRange: "", diaWeightPointers: "",
  quantity: "", orderBy: "Seyaa Solitaire", deliveryDate: "",
  pdMerchandiser: "", remarks: "",
};

export default function PdForm({ initial }: { initial?: PdInitial }) {
  const router = useRouter();
  const editing = !!initial;

  const [f, setF] = useState({
    ...BLANK,
    ...(initial || {}),
    assignedDate: initial?.assignedDate || todayInput(),
  });
  // The design number is written in three boxes — the design, then the run it
  // is being developed in — and joined back into the single number that gets
  // stored and printed.
  const [sku, setSku] = useState(() => splitDesignNo(initial?.sku || ""));
  const setSkuPart = (k: keyof typeof sku, v: string) => setSku((s) => ({ ...s, [k]: v }));
  const designNo = joinDesignNo(sku.base, sku.from, sku.to);

  const [pdNo, setPdNo] = useState(initial?.pdNo || "PD/…");
  const [diaLines, setDiaLines] = useState<DiaLine[]>(
    initial?.diaLines?.length ? initial.diaLines : [{ ...BLANK_DIA_LINE }]
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  // Predicted PD number (create mode only).
  const latest = useRef(0);
  useEffect(() => {
    if (editing) return;
    const n = ++latest.current;
    fetch(`/api/pd?next=${encodeURIComponent(f.assignedDate)}`)
      .then((r) => r.json())
      .then((d) => { if (n === latest.current && d.pdNo) setPdNo(d.pdNo); })
      .catch(() => {});
  }, [f.assignedDate, editing]);

  // A bulk design carries its pieces in its number: "SN-BR-AMF-41-49" is nine
  // pieces, 41 to 49, each searchable on its own once this is saved.
  const run = useMemo(() => parseDesignNo(designNo), [designNo]);
  const pieces = useMemo(() => pieceNumbers(run), [run]);
  const count = designNo.trim() ? pieceCount(run) : 0;

  // Who a design may be assigned to. A controlled list: staff choose from it,
  // and only an admin adds to it.
  const [mfgs, setMfgs] = useState<string[]>([]);
  useEffect(() => {
    let off = false;
    fetch("/api/parties?kind=mfg")
      .then((r) => (r.ok ? r.json() : { parties: [] }))
      .then((d) => { if (!off) setMfgs((d.parties || []).map((p: { name: string }) => p.name)); })
      .catch(() => {});
    return () => { off = true; };
  }, []);
  // Just the piece numbers — "005", "006" — which is how a diamond size names
  // the pieces it goes into, and how the register writes them.
  const subs = useMemo(
    () => pieces.map((p) => splitPiece(p).sub).filter(Boolean),
    [pieces]
  );

  // "49 to 41" is a slip, not a run — reading it as one would silently make a
  // single piece numbered 41, so it is called out instead.
  const backwards =
    !!sku.from.trim() && !!sku.to.trim() &&
    /^[0-9]+$/.test(sku.from.trim()) && /^[0-9]+$/.test(sku.to.trim()) &&
    +sku.to.trim() < +sku.from.trim();

  // Quantity is the same fact written twice, so it follows the design number —
  // but only while it agrees, so a deliberately different quantity is left alone.
  const lastCount = useRef(0);
  useEffect(() => {
    const was = lastCount.current;
    lastCount.current = count;
    if (!count) return;
    setF((s) => {
      const q = s.quantity.trim();
      return q === "" || q === String(was) ? { ...s, quantity: String(count) } : s;
    });
  }, [count]);

  const qtyMismatch =
    count > 0 && f.quantity.trim() !== "" && f.quantity.trim() !== String(count);

  async function pickPhoto(file: File) {
    setError("");
    setUploading(true);
    try {
      const small = await compress(file);
      const fd = new FormData();
      fd.append("file", small, file.name);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      set("photoPath", data.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setError("");
    if (!designNo && !f.product) {
      setError("Add at least a Product or SKU before saving.");
      return;
    }
    if (backwards) {
      setError("The design number runs backwards — put the smaller number in From.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/pd/${initial!.id}` : "/api/pd", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...f, sku: designNo, diaShape, diaWeightPointers: diaText, diaLines,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the PD sheet.");
      router.push(`/pd/${data.sheet.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the PD sheet.");
      setSaving(false);
    }
  }

  // The printed sheet keeps its single Shape cell and one "Dia. Weight &
  // Pointers" line — both are composed from the rows above.
  const diaShape = shapesFromLines(diaLines) || f.diaShape;
  const diaText = formatDiaLines(diaLines) || f.diaWeightPointers;
  // Typed diamonds with no rows behind them: the sheet reads fine on paper and
  // is empty to everything downstream.
  const legacyDia =
    !!f.diaWeightPointers.trim() && !formatDiaLines(diaLines).trim();
  const photoUrl = f.photoPath ? `/api/photo?p=${encodeURIComponent(f.photoPath)}` : "";

  return (
    <div className="app">
      <aside className="controls no-print">
        <fieldset className="group">
          <legend>Design Photo</legend>
          {f.photoPath ? (
            <div className="photo-prev">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl} alt="Design" />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" onClick={() => fileRef.current?.click()}>Replace</button>
                <button className="btn" onClick={() => set("photoPath", "")}>Remove</button>
              </div>
            </div>
          ) : (
            <div className="photo-drop" onClick={() => fileRef.current?.click()}>
              {uploading ? "Uploading…" : "Click to upload the design photo"}
            </div>
          )}
          <input
            ref={fileRef} type="file" accept="image/*" hidden
            onChange={(e) => { const file = e.target.files?.[0]; if (file) pickPhoto(file); e.target.value = ""; }}
          />
        </fieldset>

        <fieldset className="group">
          <legend>Design Number</legend>
          <div className="pd-skubox">
            <div className="cap">SKU No.</div>
            <input
              value={sku.base}
              onChange={(e) => setSkuPart("base", e.target.value)}
              placeholder="SN-BR-AMF"
            />
            <div className="sku-run">
              <label className="field">
                <span>From</span>
                <input
                  value={sku.from} inputMode="numeric" placeholder="41"
                  onChange={(e) => setSkuPart("from", e.target.value)}
                />
              </label>
              <span className="dash" aria-hidden="true">–</span>
              <label className="field">
                <span>To</span>
                <input
                  value={sku.to} inputMode="numeric" placeholder="49"
                  onChange={(e) => setSkuPart("to", e.target.value)}
                />
              </label>
            </div>
            <p className="hint">
              The design on top, then the numbers it is being developed in.
              Leave <b>To</b> empty for a single piece.
            </p>
            {designNo && (
              <p className="sku-full">
                Prints as <code>{designNo}</code>
              </p>
            )}
            {backwards && (
              <p className="hint warn">
                <b>To</b> is lower than <b>From</b>. Put the smaller number first.
              </p>
            )}
          </div>

          {count > 1 && (
            <div className="run-box">
              <p className="run-lede">
                <b>{count} pieces</b> under this design:{" "}
                <code>{pieces[0]}</code> to <code>{pieces[pieces.length - 1]}</code>
              </p>
              <div className="run-chips">
                {pieces.map((p) => <code key={p}>{p}</code>)}
              </div>
              <p className="hint">
                Each of these can be searched on its own later, even before the
                piece reaches the stock sheet.
              </p>
              {pieceCount(run) > MAX_PIECES && (
                <p className="hint warn">
                  That run is {pieceCount(run)} pieces — only the first{" "}
                  {MAX_PIECES} are tracked. Check the design number.
                </p>
              )}
            </div>
          )}
          {count === 1 && run.at !== -1 && (
            <p className="hint">
              One piece, number {run.from}. For a bulk run put the last number in{" "}
              <b>To</b> — {run.from + 4} would make it five.
            </p>
          )}
        </fieldset>

        <fieldset className="group">
          <legend>Product</legend>
          <label className="field"><span>Product</span>
            <Picker value={f.product} onChange={(v) => set("product", v)}
              options={PRODUCTS} prompt="Choose a product…" /></label>
          <label className="field"><span>Category</span>
            <Picker value={f.category} onChange={(v) => set("category", v)}
              options={CATEGORIES} prompt="Choose a category…" /></label>
          {/* The one that stays open: a sub-category describes the design, and
              a new one is the designer's to write. The list is there to be
              picked from when it already says the right thing. */}
          <label className="field"><span>Sub-category</span>
            <Combo value={f.subCategory} onChange={(v) => set("subCategory", v)} options={SUB_CATEGORIES} placeholder="Tennis Necklace" /></label>
          <div className="two">
            <label className="field"><span>Type</span>
              <Picker value={f.type} onChange={(v) => set("type", v)}
                options={TYPES} prompt="Choose a type…" /></label>
            <label className="field"><span>{sizeLabel(f.product)}</span>
              <input value={f.size} onChange={(e) => set("size", e.target.value)} placeholder={'16.5" INCH'} /></label>
          </div>
        </fieldset>

        <fieldset className="group">
          <legend>Diamond &amp; Gold</legend>
          <label className="field"><span>Dia. quality</span>
            <Picker value={f.diaQuality || DEFAULT_DIA_QUALITY}
              onChange={(v) => set("diaQuality", v)}
              options={DIA_QUALITIES} prompt="Choose a quality…" /></label>

          <div className="field">
            <span>Diamond sizes</span>
            <p className="group-hint" style={{ margin: "0 0 8px" }}>
              Pick the shape first. Round asks for a sieve size; fancy shapes ask
              for the MM and the weight of one stone — write it in cts or pts and
              that is how it prints.
            </p>
            <DiamondSizePicker lines={diaLines} onChange={setDiaLines} run={subs} />
            {diaText && <p className="dia-preview">{diaText}</p>}
            {/* Sheets written before these rows existed carry their diamond
                line as one typed sentence. It still prints, but nothing
                downstream can read it — the demand comes out blank and the
                register has no sizes to issue — so it is put in front of
                whoever opens the sheet next. */}
            {legacyDia && (
              <p className="dia-legacy">
                This sheet&rsquo;s diamonds were written as one line before these
                rows existed: <b>{f.diaWeightPointers}</b>. Enter them above, or
                the demand and the jangad have no sizes to work from.
              </p>
            )}
          </div>
          <div className="two">
            <label className="field"><span>Gold purity</span>
              <Combo value={f.goldPurity} onChange={(v) => set("goldPurity", v)} options={GOLD_PURITIES} placeholder="14KT" /></label>
            <label className="field"><span>Gold colour</span>
              <Combo value={f.goldColor} onChange={(v) => set("goldColor", v)} options={GOLD_COLORS} placeholder="White Gold" /></label>
          </div>
          <div className="two">
            <label className="field"><span>Gold weight</span>
              <input value={f.goldWeight} onChange={(e) => set("goldWeight", e.target.value)} placeholder="10 TO 12 GMS" /></label>
            <label className="field"><span>Locks</span>
              <Combo value={f.locks} onChange={(v) => set("locks", v)} options={LOCKS} placeholder="Under Lock" /></label>
          </div>
        </fieldset>

        <fieldset className="group">
          <legend>Order</legend>
          <div className="two">
            <label className="field"><span>Zone</span>
              <Combo value={f.zone} onChange={(v) => set("zone", v)} options={ZONES} placeholder="USA" /></label>
            <label className="field"><span>Order type</span>
              <Combo value={f.orderType} onChange={(v) => set("orderType", v)} options={ORDER_TYPES} placeholder="Stock" /></label>
          </div>
          <div className="two">
            <label className="field"><span>Quantity</span>
              <input value={f.quantity} onChange={(e) => set("quantity", e.target.value)} placeholder="5" /></label>
            <label className="field"><span>Price range</span>
              <input value={f.priceRange} onChange={(e) => set("priceRange", e.target.value)} /></label>
          </div>
          {qtyMismatch && (
            <p className="hint warn">
              The design number covers {count} {count === 1 ? "piece" : "pieces"}
              , but Quantity says {f.quantity.trim()}.{" "}
              <button type="button" className="linkbtn"
                onClick={() => set("quantity", String(count))}>
                Use {count}
              </button>
            </p>
          )}
          <label className="field"><span>Order by</span>
            <input value={f.orderBy} onChange={(e) => set("orderBy", e.target.value)} /></label>
        </fieldset>

        <fieldset className="group">
          <legend>People &amp; Dates</legend>
          <div className="two">
            <label className="field"><span>Assigned to</span>
              <Picker value={f.assignedTo} onChange={(v) => set("assignedTo", v)}
                options={mfgs} prompt="Choose a manufacturer…" />
              {mfgs.length === 0 && (
                <p className="dia-note">
                  No manufacturers on the list yet — an admin adds them under Parties.
                </p>
              )}</label>
            <label className="field"><span>PD Merchandiser</span>
              <input value={f.pdMerchandiser} onChange={(e) => set("pdMerchandiser", e.target.value)} placeholder="Pritesh Bhosale" /></label>
          </div>
          <div className="two">
            <label className="field"><span>Assigned date</span>
              <input type="date" value={f.assignedDate} onChange={(e) => set("assignedDate", e.target.value)} /></label>
            <label className="field"><span>Delivery date</span>
              <input type="date" value={f.deliveryDate} onChange={(e) => set("deliveryDate", e.target.value)} /></label>
          </div>
          <label className="field"><span>Remarks</span>
            <textarea value={f.remarks} onChange={(e) => set("remarks", e.target.value)}
              placeholder="Make it Light Weight …" /></label>
        </fieldset>

        <div className="actions">
          <button className="btn btn-primary" onClick={save} disabled={saving || uploading}>
            {saving ? "Saving…" : editing ? "Update PD Sheet" : "Save PD Sheet"}
          </button>
        </div>
        {error && <p className="save-error">{error}</p>}
      </aside>

      <main className="stage">
        <PdSheetView
          data={{ ...f, sku: designNo, diaShape, diaWeightPointers: diaText, pdNo, photoUrl }}
        />
      </main>
    </div>
  );
}

// Shrink large camera photos in the browser so uploads stay small and fast.
async function compress(file: File): Promise<Blob> {
  if (file.size < 400_000) return file;
  const img = document.createElement("img");
  const url = URL.createObjectURL(file);
  try {
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const max = 1200;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    return blob || file;
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

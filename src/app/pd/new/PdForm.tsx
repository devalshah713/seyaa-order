"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PdSheetView from "@/components/PdSheetView";
import Combo from "@/components/Combo";
import { todayInput } from "@/lib/memoFormat";
import {
  PRODUCTS, CATEGORIES, SUB_CATEGORIES, TYPES, DIA_QUALITIES, DIA_SHAPES,
  GOLD_PURITIES, GOLD_COLORS, ZONES, LOCKS, ORDER_TYPES, sizeLabel,
} from "@/lib/pdConfig";

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
};

const BLANK: Omit<PdInitial, "id" | "pdNo"> = {
  photoPath: "", sku: "",
  product: "", category: "", subCategory: "", type: "",
  diaQuality: "", goldWeight: "", locks: "", orderType: "Stock", assignedDate: "",
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
  const [pdNo, setPdNo] = useState(initial?.pdNo || "PD/…");
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
    if (!f.sku && !f.product) {
      setError("Add at least a Product or SKU before saving.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/pd/${initial!.id}` : "/api/pd", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
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
              value={f.sku}
              onChange={(e) => set("sku", e.target.value)}
              placeholder="SS-NK-SL-KO-20CT-011-015-WG-14KT-USA"
            />
            <p className="hint">Type the design number exactly as it should print.</p>
          </div>
        </fieldset>

        <fieldset className="group">
          <legend>Product</legend>
          <label className="field"><span>Product</span>
            <Combo value={f.product} onChange={(v) => set("product", v)} options={PRODUCTS} placeholder="Tennis Necklace" /></label>
          <label className="field"><span>Category</span>
            <Combo value={f.category} onChange={(v) => set("category", v)} options={CATEGORIES} placeholder="Korean Necklace" /></label>
          <label className="field"><span>Sub-category</span>
            <Combo value={f.subCategory} onChange={(v) => set("subCategory", v)} options={SUB_CATEGORIES} placeholder="Tennis Necklace" /></label>
          <div className="two">
            <label className="field"><span>Type</span>
              <Combo value={f.type} onChange={(v) => set("type", v)} options={TYPES} placeholder="Modern" /></label>
            <label className="field"><span>{sizeLabel(f.product)}</span>
              <input value={f.size} onChange={(e) => set("size", e.target.value)} placeholder={'16.5" INCH'} /></label>
          </div>
        </fieldset>

        <fieldset className="group">
          <legend>Diamond &amp; Gold</legend>
          <div className="two">
            <label className="field"><span>Dia. quality</span>
              <Combo value={f.diaQuality} onChange={(v) => set("diaQuality", v)} options={DIA_QUALITIES} placeholder="VVS-EF" /></label>
            <label className="field"><span>Dia. shape</span>
              <Combo value={f.diaShape} onChange={(v) => set("diaShape", v)} options={DIA_SHAPES} placeholder="Round" /></label>
          </div>
          <label className="field"><span>Dia. weight &amp; pointers</span>
            <input value={f.diaWeightPointers} onChange={(e) => set("diaWeightPointers", e.target.value)}
              placeholder="ROUND - +15-15.5 – 110 PCS" /></label>
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
          <label className="field"><span>Order by</span>
            <input value={f.orderBy} onChange={(e) => set("orderBy", e.target.value)} /></label>
        </fieldset>

        <fieldset className="group">
          <legend>People &amp; Dates</legend>
          <div className="two">
            <label className="field"><span>Assigned to</span>
              <input value={f.assignedTo} onChange={(e) => set("assignedTo", e.target.value)} placeholder="PRATIK C6" /></label>
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
        <PdSheetView data={{ ...f, pdNo, photoUrl }} />
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

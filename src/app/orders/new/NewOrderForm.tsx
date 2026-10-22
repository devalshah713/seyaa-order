"use client";
// The one place a new order is written.
//
// Everything a piece needs to be made is asked for here, because an order that
// reaches the factory missing its size or its shape comes back as a phone call
// the next morning. What is deliberately not here: the party, the
// manufacturer, the design number and a delivery date. The owner puts those on
// afterwards, and a seller who is shown them fills them in wrongly.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Picker from "@/components/Picker";
import { GOLD_DETAILS } from "@/lib/memoFormat";
import { DIA_SHAPES } from "@/lib/pdConfig";
import { photoSrc, uploadToCloudinary } from "@/lib/cloudinary";
import { readReply } from "@/lib/readReply";

const BLANK = {
  productName: "",
  category: "",
  subCategory: "",
  subSubCategory: "",
  goldColor: "",
  pcs: "1",
  size: "",
  diaShape: "",
  diamondCts: "",
  sieveSize: "",
  stonePcs: "",
  stockNo: "",
  photoPath: "",
  photoPublicId: "",
  instructions: "",
};

type Field = keyof typeof BLANK;

export default function NewOrderForm() {
  const router = useRouter();
  const [f, setF] = useState(BLANK);
  const [categories, setCategories] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (k: Field, v: string) => setF((s) => ({ ...s, [k]: v }));

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
      // Straight from this browser to Cloudinary, exactly as a PD sheet's
      // photo goes. Shrunk first because a phone photo is several megabytes.
      const small = await compress(file);
      const shot = await uploadToCloudinary(small, file.name);
      setF((cur) => ({ ...cur, photoPath: shot.secure_url, photoPublicId: shot.public_id }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The picture did not upload. Try again.");
    } finally {
      setUploading(false);
    }
  }

  // The complaint names the box, and the page puts the cursor in it. "Please
  // fill in all required fields" sends somebody hunting down a long form.
  function complain(message: string, box: string) {
    setError(message);
    const el = document.getElementById(box);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    (el as HTMLElement | null)?.focus();
  }

  function firstProblem(): [string, string] | null {
    if (!f.productName.trim()) return ["Write what is being made, in words.", "o-made"];
    if (!f.photoPath) {
      return ["Add the reference picture.", "o-picture"];
    }
    if (!f.category) return ["Choose a category.", "o-category"];
    if (!f.goldColor) return ["Choose the gold details.", "o-gold"];
    if (!(Math.round(Number(f.pcs)) >= 1)) {
      return ["Enter the quantity in pieces. It must be a whole number, at least 1.", "o-pcs"];
    }
    if (!f.size.trim()) return ["Enter the size, for example 7 INCH or US7.", "o-size"];
    if (!f.diaShape) return ["Choose the diamond shape.", "o-shape"];
    if (!(Number(f.diamondCts) > 0)) {
      return ["Enter the approximate diamond weight in carats.", "o-cts"];
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
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const data = await readReply(res, "Could not save the order.");
      const order = data.order as { id?: string } | undefined;
      if (!order?.id) {
        throw new Error(
          "The order was saved, but this page could not open it. Find it on the Orders list."
        );
      }
      router.push(`/orders/${order.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the order.");
      setSaving(false);
    }
  }

  const photoUrl = photoSrc(f.photoPath);

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>New Order</h1>
        <Link href="/orders" className="btn">← All orders</Link>
      </div>

      <form className="ord-form" onSubmit={save}>
        <fieldset className="group">
          <legend>What is being made</legend>
          <label className="field" htmlFor="o-made">
            <span>In words</span>
            <input
              id="o-made"
              value={f.productName}
              onChange={(e) => set("productName", e.target.value)}
              placeholder="50PTS EACH OVAL BEZEL TENNIS BRACELET"
              autoFocus
            />
          </label>
          <p className="group-hint">
            Write it the way you would say it to the factory.
          </p>
        </fieldset>

        <fieldset className="group">
          <legend>Reference picture</legend>
          <p className="group-hint">
            Every order needs one.
          </p>
          {f.photoPath ? (
            <div className="photo-prev">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl} alt="Reference" />
              <div style={{ display: "flex", gap: 8 }}>
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
          ) : (
            <div
              id="o-picture"
              className="photo-drop ord-drop"
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? "Uploading…" : "Click here to upload the reference picture"}
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
          <legend>Product</legend>
          <label className="field" htmlFor="o-category">
            <span>Category</span>
            <Picker
              id="o-category"
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
            <label className="field" htmlFor="o-sub">
              <span>Sub-category <em>(optional)</em></span>
              <input
                id="o-sub"
                value={f.subCategory}
                onChange={(e) => set("subCategory", e.target.value)}
                placeholder="Type anything"
              />
            </label>
            <label className="field" htmlFor="o-subsub">
              <span>Sub-sub-category <em>(optional)</em></span>
              <input
                id="o-subsub"
                value={f.subSubCategory}
                onChange={(e) => set("subSubCategory", e.target.value)}
                placeholder="Type anything"
              />
            </label>
          </div>
          <p className="group-hint">
            These two boxes are free. Write whatever the customer said.
          </p>
        </fieldset>

        <fieldset className="group">
          <legend>Gold and size</legend>
          <label className="field" htmlFor="o-gold">
            <span>Gold details</span>
            <Picker
              id="o-gold"
              value={f.goldColor}
              onChange={(v) => set("goldColor", v)}
              options={GOLD_DETAILS}
              prompt="Choose the gold…"
            />
          </label>
          <div className="two">
            <label className="field" htmlFor="o-pcs">
              <span>Quantity in pieces</span>
              <input
                id="o-pcs"
                value={f.pcs}
                inputMode="numeric"
                onChange={(e) => set("pcs", e.target.value)}
                placeholder="1"
              />
            </label>
            <label className="field" htmlFor="o-size">
              <span>Size</span>
              <input
                id="o-size"
                value={f.size}
                onChange={(e) => set("size", e.target.value)}
                placeholder="7 INCH or US7"
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="group">
          <legend>Diamonds</legend>
          <div className="two">
            <label className="field" htmlFor="o-shape">
              <span>Diamond shape</span>
              <Picker
                id="o-shape"
                value={f.diaShape}
                onChange={(v) => set("diaShape", v)}
                options={DIA_SHAPES}
                prompt="Choose a shape…"
              />
            </label>
            <label className="field" htmlFor="o-cts">
              <span>Approximate diamond weight (cts)</span>
              <input
                id="o-cts"
                value={f.diamondCts}
                inputMode="decimal"
                onChange={(e) => set("diamondCts", e.target.value)}
                placeholder="3.01"
              />
            </label>
          </div>
          <div className="two">
            <label className="field" htmlFor="o-sieve">
              <span>Sieve or size <em>(optional)</em></span>
              <input
                id="o-sieve"
                value={f.sieveSize}
                onChange={(e) => set("sieveSize", e.target.value)}
                placeholder="+1.30-1.40"
              />
            </label>
            <label className="field" htmlFor="o-stones">
              <span>Approximate stone pieces <em>(optional)</em></span>
              <input
                id="o-stones"
                value={f.stonePcs}
                inputMode="numeric"
                onChange={(e) => set("stonePcs", e.target.value)}
                placeholder="56"
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="group">
          <legend>Anything else</legend>
          <label className="field" htmlFor="o-stock">
            <span>Stock number <em>(only if an existing piece is being remade)</em></span>
            <input
              id="o-stock"
              value={f.stockNo}
              onChange={(e) => set("stockNo", e.target.value)}
              placeholder="optional"
            />
          </label>
          <label className="field" htmlFor="o-notes">
            <span>Special instructions <em>(optional)</em></span>
            <textarea
              id="o-notes"
              value={f.instructions}
              onChange={(e) => set("instructions", e.target.value)}
              placeholder="Make it light weight. Bezel setting only."
            />
          </label>
        </fieldset>

        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={saving || uploading}>
            {saving ? "Saving…" : "Save order"}
          </button>
        </div>
        {error && <p className="save-error">{error}</p>}
        <p className="hint">
          The order number, the time and your username are added by the portal.
          <br />
          The party, the manufacturer and the design number are put on afterwards.
        </p>
      </form>
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

"use client";
// Raising a CAD request, or correcting one.
//
// What goes on it is what goes to the factory today on WhatsApp: which factory,
// the customer's reference photos, the centre stone, and the piece. Written for
// a phone: one column, every box a thumb's target, photos taken straight from
// the camera.
//
// The photos go the way every picture in the portal goes: straight from this
// browser to Cloudinary, shrunk first, and only the link comes here.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Picker from "@/components/Picker";
import { GOLD_DETAILS } from "@/lib/memoFormat";
import {
  CAD_SHAPES, STONE_LABS, type CadFormValues, type StoneLab,
} from "@/lib/cadConfig";
import { compressImage, photoSrc, uploadToCloudinary } from "@/lib/cloudinary";
import { readReply } from "@/lib/readReply";

export default function CadForm({
  editId,
  initial,
  nextNo,
  mfgs,
  categories,
}: {
  // Set when correcting a saved request; absent when raising a new one.
  editId?: string;
  initial: CadFormValues;
  nextNo?: string;
  mfgs: string[];
  categories: string[];
}) {
  const router = useRouter();
  const [f, setF] = useState<CadFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");
  const refRef = useRef<HTMLInputElement>(null);
  const certRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof CadFormValues>(k: K, v: CadFormValues[K]) =>
    setF((s) => ({ ...s, [k]: v }));

  async function addRefPhotos(files: File[]) {
    setError("");
    setUploading("ref");
    try {
      // One at a time, so a phone on a weak signal finishes each before the
      // next starts, and one that fails does not lose the ones before it.
      for (const file of files) {
        const shot = await uploadToCloudinary(await compressImage(file), file.name);
        setF((cur) => ({
          ...cur,
          refPhotos: [...cur.refPhotos, { url: shot.secure_url, publicId: shot.public_id }],
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "A photo did not upload. Try again.");
    } finally {
      setUploading("");
    }
  }

  async function addCertPhoto(file: File) {
    setError("");
    setUploading("cert");
    try {
      const shot = await uploadToCloudinary(await compressImage(file, 1800), file.name);
      set("certPhoto", { url: shot.secure_url, publicId: shot.public_id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The certificate photo did not upload. Try again.");
    } finally {
      setUploading("");
    }
  }

  function complain(message: string, box: string) {
    setError(message);
    const el = document.getElementById(box) as HTMLElement | null;
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function firstProblem(): [string, string] | null {
    if (!f.factory) return ["Choose the factory.", "c-factory"];
    if (f.refPhotos.length === 0) return ["Add at least one reference photo.", "c-photos"];
    if (!f.shape) return ["Choose the centre stone's shape.", "c-shape"];
    if (!(Number(f.carats) > 0)) {
      return ["Enter the centre stone's weight in carats, for example 2.01.", "c-carats"];
    }
    if (!f.category) return ["Choose a category.", "c-category"];
    if (!f.goldDetails) return ["Choose the gold details.", "c-gold"];
    return null;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const problem = firstProblem();
    if (problem) { complain(problem[0], problem[1]); return; }

    setSaving(true);
    try {
      const body = {
        factory: f.factory,
        refPhotos: f.refPhotos,
        stone: {
          lab: f.lab,
          certNo: f.certNo,
          shape: f.shape,
          carats: f.carats,
          colour: f.colour,
          clarity: f.clarity,
          measurements: f.measurements,
          certPhoto: f.certPhoto || undefined,
        },
        category: f.category,
        goldDetails: f.goldDetails,
        size: f.size,
        sideStones: f.sideStones,
        notes: f.notes,
      };
      const res = await fetch(editId ? `/api/orders/cad/${editId}` : "/api/orders/cad", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await readReply(res, "Could not save the CAD request.");
      const saved = data.request as { id?: string } | undefined;
      if (!saved?.id) {
        throw new Error("The request was saved, but this page could not open it. Find it on the CAD list.");
      }
      router.push(`/orders/cad/${saved.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the CAD request.");
      setSaving(false);
    }
  }

  return (
    <form className="ord-form cad-form" onSubmit={save}>
      <fieldset className="group">
        <legend>Factory</legend>
        <label className="field" htmlFor="c-factory">
          <span>Which factory makes the CAD <em className="need">must be filled</em></span>
          <Picker
            id="c-factory"
            value={f.factory}
            onChange={(v) => set("factory", v)}
            options={mfgs}
            prompt="Choose the factory…"
          />
        </label>
        {mfgs.length === 0 && (
          <p className="dia-note">
            Nothing on the manufacturer list yet. An admin adds them under Lists.
          </p>
        )}
        {nextNo && <p className="group-hint">This request will be {nextNo}.</p>}
      </fieldset>

      <fieldset className="group">
        <legend>Reference photos</legend>
        <p className="group-hint">
          The design the customer brought. At least one. Add as many as help.
        </p>
        {f.refPhotos.length > 0 && (
          <div className="cad-thumbs">
            {f.refPhotos.map((p, i) => (
              <div key={p.url} className="cad-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoSrc(p.url)} alt={`Reference ${i + 1}`} />
                <button
                  type="button"
                  className="btn"
                  onClick={() => set("refPhotos", f.refPhotos.filter((_, n) => n !== i))}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <div
          id="c-photos"
          className={`photo-drop ord-drop${uploading === "ref" ? " is-busy" : ""}`}
          role="button"
          tabIndex={0}
          aria-busy={uploading === "ref"}
          onClick={() => { if (!uploading) refRef.current?.click(); }}
          onKeyDown={(e) => {
            if (!uploading && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              refRef.current?.click();
            }
          }}
        >
          {uploading === "ref"
            ? "Uploading the photos…"
            : f.refPhotos.length > 0
              ? "Add another photo"
              : "Take a photo, or choose from the phone"}
        </div>
        <input
          ref={refRef} type="file" accept="image/*" multiple hidden
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length) void addRefPhotos(files);
            e.target.value = "";
          }}
        />
      </fieldset>

      <fieldset className="group">
        <legend>Centre stone</legend>
        <div className="two">
          <label className="field" htmlFor="c-shape">
            <span>Shape <em className="need">must be filled</em></span>
            <Picker
              id="c-shape"
              value={f.shape}
              onChange={(v) => set("shape", v)}
              options={CAD_SHAPES}
              prompt="Choose the shape…"
            />
          </label>
          <label className="field" htmlFor="c-carats">
            <span>Weight in carats <em className="need">must be filled</em></span>
            <input
              id="c-carats"
              value={f.carats}
              inputMode="decimal"
              onChange={(e) => set("carats", e.target.value)}
              placeholder="2.01"
            />
          </label>
        </div>
        <div className="two">
          <label className="field" htmlFor="c-lab">
            <span>Certificate</span>
            <select
              id="c-lab"
              value={f.lab}
              onChange={(e) => set("lab", e.target.value as StoneLab)}
            >
              {STONE_LABS.map((l) => (
                <option key={l} value={l}>{l === "None" ? "No certificate" : l}</option>
              ))}
            </select>
          </label>
          {f.lab !== "None" && (
            <label className="field" htmlFor="c-certno">
              <span>Certificate number <em>(optional)</em></span>
              <input
                id="c-certno"
                value={f.certNo}
                onChange={(e) => set("certNo", e.target.value)}
                placeholder="LG612345678"
              />
            </label>
          )}
        </div>
        <div className="two">
          <label className="field" htmlFor="c-colour">
            <span>Colour <em>(optional)</em></span>
            <input
              id="c-colour"
              value={f.colour}
              onChange={(e) => set("colour", e.target.value)}
              placeholder="F"
            />
          </label>
          <label className="field" htmlFor="c-clarity">
            <span>Clarity <em>(optional)</em></span>
            <input
              id="c-clarity"
              value={f.clarity}
              onChange={(e) => set("clarity", e.target.value)}
              placeholder="VS1"
            />
          </label>
        </div>
        <label className="field" htmlFor="c-mm">
          <span>Measurements in mm <em>(optional)</em></span>
          <input
            id="c-mm"
            value={f.measurements}
            onChange={(e) => set("measurements", e.target.value)}
            placeholder="8.10 x 6.02 x 3.80"
          />
        </label>

        <div className="field">
          <span>Certificate photo <em>(optional)</em></span>
          {f.certPhoto ? (
            <div className="cad-thumbs">
              <div className="cad-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoSrc(f.certPhoto.url)} alt="Certificate" />
                <button type="button" className="btn" onClick={() => set("certPhoto", null)}>
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn cad-wide"
              disabled={!!uploading}
              onClick={() => certRef.current?.click()}
            >
              {uploading === "cert" ? "Uploading the certificate…" : "Add a photo of the certificate"}
            </button>
          )}
          <p className="group-hint">
            A photo or screenshot of the certificate. A PDF cannot be added here.
          </p>
          <input
            ref={certRef} type="file" accept="image/*" hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void addCertPhoto(file);
              e.target.value = "";
            }}
          />
        </div>
      </fieldset>

      <fieldset className="group">
        <legend>Piece</legend>
        <label className="field" htmlFor="c-category">
          <span>Category <em className="need">must be filled</em></span>
          <Picker
            id="c-category"
            value={f.category}
            onChange={(v) => set("category", v)}
            options={categories}
            prompt="Choose a category…"
          />
        </label>
        {categories.length === 0 && (
          <p className="dia-note">
            Nothing on the category list yet. An admin adds them under Lists.
          </p>
        )}
        <div className="two">
          <label className="field" htmlFor="c-gold">
            <span>Gold details <em className="need">must be filled</em></span>
            <Picker
              id="c-gold"
              value={f.goldDetails}
              onChange={(v) => set("goldDetails", v)}
              options={GOLD_DETAILS}
              prompt="Choose the gold…"
            />
          </label>
          <label className="field" htmlFor="c-size">
            <span>Size <em>(optional)</em></span>
            <input
              id="c-size"
              value={f.size}
              onChange={(e) => set("size", e.target.value)}
              placeholder="US7"
            />
          </label>
        </div>
        <label className="field" htmlFor="c-side">
          <span>Side stones</span>
          <input
            id="c-side"
            value={f.sideStones}
            onChange={(e) => set("sideStones", e.target.value)}
          />
        </label>
        <label className="field" htmlFor="c-notes">
          <span>Notes for the factory <em>(optional)</em></span>
          <textarea
            id="c-notes"
            value={f.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Low setting. Hidden halo."
          />
        </label>
      </fieldset>

      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={saving || !!uploading}>
          {saving ? "Saving…" : editId ? "Save the changes" : "Save the request"}
        </button>
      </div>
      {error && <p className="save-error">{error}</p>}
      {!editId && (
        <p className="hint">
          The number, the time and your username are added by the portal.
          <br />
          After saving, send it to the factory from the request&rsquo;s own page.
        </p>
      )}
    </form>
  );
}

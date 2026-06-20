"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  REGIONS,
  PRODUCT_TYPES,
  MANUFACTURERS,
  PRODUCT_FIELDS,
  DIAMOND_FIELDS,
  DIAMOND_SIZES_BY_SHAPE,
  Field,
} from "@/lib/formConfig";

type DiamondBlock = { key: number; values: Record<string, string> };
type PhotoEntry = {
  id: number;
  file: File;
  localUrl: string;
  blobUrl: string | null;
  uploading: boolean;
  failed: boolean;
};
type Item = {
  key: number;
  productType: string;
  quantity: number;
  product: Record<string, string>; // product-level field values
  diamonds: DiamondBlock[];
};

let keyCounter = 1;
function blankDiamond(): DiamondBlock {
  return { key: keyCounter++, values: {} };
}
function blankItem(): Item {
  return { key: keyCounter++, productType: "", quantity: 1, product: {}, diamonds: [blankDiamond()] };
}

export default function OrderForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [orderNumber, setOrderNumber] = useState("");
  const [regionId, setRegionId] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [notes, setNotes] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [items, setItems] = useState<Item[]>([blankItem()]);
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  // Staff-added sizes, keyed by shape; loaded once and merged into the
  // built-in size list so they appear in the dropdown.
  const [customSizes, setCustomSizes] = useState<Record<string, string[]>>({});
  // When set, an inline "add a new size" panel is open for one diamond block.
  const [sizeForm, setSizeForm] = useState<{
    itemKey: number;
    dKey: number;
    shape: string;
    sieve: string;
    mm: string;
    pointers: string;
  } | null>(null);
  const [savingSize, setSavingSize] = useState(false);

  useEffect(() => {
    fetch("/api/sizes")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.sizes) setCustomSizes(d.sizes);
      })
      .catch(() => {});
  }, []);

  // Built-in sizes for a shape plus any custom ones (no duplicates).
  function sizesForShape(shape: string): string[] {
    const base = DIAMOND_SIZES_BY_SHAPE[shape] || [];
    const extra = (customSizes[shape] || []).filter((s) => !base.includes(s));
    return [...base, ...extra];
  }

  // Builds the size label from the inline fields in the same style as the
  // built-in list, e.g. "+1-1.5 · 1.15 MM · 0.07 ct". Empty fields are skipped.
  function composeSizeLabel(sieve: string, mm: string, pointers: string): string {
    const parts: string[] = [];
    const s = sieve.trim();
    const m = mm.trim();
    const p = pointers.trim();
    if (s) parts.push(s);
    if (m) parts.push(`${m} MM`);
    if (p) {
      const ct = parseFloat(p) / 100;
      if (!isNaN(ct)) parts.push(`${parseFloat(ct.toFixed(4))} ct`);
    }
    return parts.join(" · ");
  }

  async function submitCustomSize() {
    if (!sizeForm) return;
    const { itemKey, dKey, shape } = sizeForm;
    const size = composeSizeLabel(sizeForm.sieve, sizeForm.mm, sizeForm.pointers);
    if (!size) {
      setError("Enter at least the MM size for the new diamond size.");
      return;
    }

    // Show it immediately, select it, and close the panel.
    setCustomSizes((prev) => {
      const list = prev[shape] || [];
      if (list.some((s) => s.toLowerCase() === size.toLowerCase())) return prev;
      return { ...prev, [shape]: [...list, size] };
    });
    setDiamondField(itemKey, dKey, "Diamond Size", size);
    setSizeForm(null);
    setError(null);

    // Persist so it's there next time, on every device.
    setSavingSize(true);
    try {
      const res = await fetch("/api/sizes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shape, size }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.sizes) setCustomSizes(data.sizes);
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Could not save the new size permanently (it's still usable for this order).");
      }
    } catch {
      setError("Could not save the new size permanently (it's still usable for this order).");
    } finally {
      setSavingSize(false);
    }
  }

  function updateItem(key: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }
  function setProductField(key: number, field: string, value: string) {
    setItems((prev) =>
      prev.map((it) =>
        it.key === key ? { ...it, product: { ...it.product, [field]: value } } : it
      )
    );
  }
  function setDiamondField(itemKey: number, dKey: number, field: string, value: string) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== itemKey) return it;
        return {
          ...it,
          diamonds: it.diamonds.map((d) => {
            if (d.key !== dKey) return d;
            const values = { ...d.values, [field]: value };
            // Changing the shape resets the (shape-specific) size.
            if (field === "Diamond Shape") values["Diamond Size"] = "";
            return { ...d, values };
          }),
        };
      })
    );
  }
  function addDiamond(itemKey: number) {
    setItems((prev) =>
      prev.map((it) =>
        it.key === itemKey ? { ...it, diamonds: [...it.diamonds, blankDiamond()] } : it
      )
    );
  }
  function removeDiamond(itemKey: number, dKey: number) {
    setItems((prev) =>
      prev.map((it) =>
        it.key === itemKey
          ? { ...it, diamonds: it.diamonds.filter((d) => d.key !== dKey) }
          : it
      )
    );
  }

  async function uploadPhoto(entry: PhotoEntry) {
    try {
      const fd = new FormData();
      fd.append("files", entry.file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      const url: string = data.urls?.[0] || "";
      setPhotos((prev) =>
        prev.map((p) => (p.id === entry.id ? { ...p, blobUrl: url, uploading: false } : p))
      );
    } catch {
      setPhotos((prev) =>
        prev.map((p) => (p.id === entry.id ? { ...p, uploading: false, failed: true } : p))
      );
    }
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const newEntries: PhotoEntry[] = files.map((f) => ({
      id: keyCounter++,
      file: f,
      localUrl: URL.createObjectURL(f),
      blobUrl: null,
      uploading: true,
      failed: false,
    }));
    setPhotos((prev) => [...prev, ...newEntries]);
    newEntries.forEach((entry) => uploadPhoto(entry));
    e.target.value = "";
  }

  function removePhoto(id: number) {
    setPhotos((prev) => {
      const entry = prev.find((p) => p.id === id);
      if (entry) URL.revokeObjectURL(entry.localUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  function renderField(
    f: Field,
    value: string,
    onChange: (v: string) => void,
    sizeOptions?: string[]
  ) {
    const options = f.optionsByShape ? sizeOptions || [] : f.options || [];
    if (f.inputType === "SELECT") {
      return (
        <select value={value || ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        type={f.inputType === "NUMBER" ? "number" : "text"}
        step="any"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!orderNumber.trim()) return setError("Please enter an order number.");
    if (!regionId) return setError("Please choose a region.");
    if (!customerName.trim()) return setError("Please enter the customer name.");
    if (items.some((i) => !i.productType))
      return setError("Please choose a product type for every item.");

    // Required product fields.
    for (const it of items) {
      for (const f of PRODUCT_FIELDS) {
        if (f.required && !(it.product[f.name] && it.product[f.name].trim())) {
          return setError(`"${f.name}" is required for ${it.productType || "the product"}.`);
        }
      }
      // Diamond blocks: a block with a shape must have all fields filled.
      for (const d of it.diamonds) {
        const hasShape = !!d.values["Diamond Shape"];
        const hasAny = Object.values(d.values).some((v) => v && v.trim());
        if (!hasShape && !hasAny) continue; // empty block ignored
        for (const f of DIAMOND_FIELDS) {
          if (f.required && !(d.values[f.name] && d.values[f.name].trim())) {
            return setError(`"${f.name}" is required for each diamond shape you add.`);
          }
        }
      }
    }

    const pendingUploads = photos.filter((p) => p.uploading);
    if (pendingUploads.length) return setError("Please wait for all photos to finish uploading.");

    const failedUploads = photos.filter((p) => p.failed);
    if (failedUploads.length)
      return setError("Some photos failed to upload. Remove them or retry before saving.");

    setSubmitting(true);
    const photoUrls = photos.filter((p) => p.blobUrl).map((p) => p.blobUrl!);
    const payload = {
      orderNumber,
      region: regionId,
      customerName,
      manufacturer,
      notes,
      photos: photoUrls,
      items: items.map((it) => ({
        productType: it.productType,
        quantity: Number(it.quantity) || 1,
        product: it.product,
        diamonds: it.diamonds
          .filter((d) => d.values["Diamond Shape"])
          .map((d) => d.values),
      })),
    };

    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Failed to create order.");
      setSubmitting(false);
      return;
    }
    const d = await res.json();
    router.push(`/orders/view?id=${encodeURIComponent(d.id)}`);
  }

  return (
    <form onSubmit={submit}>
      {error && (
        <div className="card" style={{ borderColor: "#dc2626", color: "#dc2626", background: "#fef2f2" }}>
          {error}
        </div>
      )}

      <div className="card">
        <h2>Order Details</h2>
        <div className="grid3">
          <div className="field">
            <label>
              Order Number <span className="req">*</span>
            </label>
            <input
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="Your order number"
            />
          </div>
          <div className="field">
            <label>
              Region <span className="req">*</span>
            </label>
            <select value={regionId} onChange={(e) => setRegionId(e.target.value)}>
              <option value="">Select region…</option>
              {REGIONS.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.name} ({r.currency})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>
              Customer Name <span className="req">*</span>
            </label>
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
        </div>
        <div className="grid2">
          <div className="field">
            <label>Manufacturer</label>
            <select value={manufacturer} onChange={(e) => setManufacturer(e.target.value)}>
              <option value="">Select manufacturer…</option>
              {MANUFACTURERS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row spread">
          <h2>Products</h2>
          <button type="button" className="btn ghost small" onClick={() => setItems([...items, blankItem()])}>
            + Add product
          </button>
        </div>

        {items.map((it, idx) => (
          <div className="item-block" key={it.key}>
            <div className="row spread">
              <strong>Item {idx + 1}</strong>
              {items.length > 1 && (
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => setItems(items.filter((x) => x.key !== it.key))}
                >
                  Remove item
                </button>
              )}
            </div>

            <div className="grid3" style={{ marginTop: 12 }}>
              <div className="field">
                <label>
                  Product Type <span className="req">*</span>
                </label>
                <select
                  value={it.productType}
                  onChange={(e) => updateItem(it.key, { productType: e.target.value })}
                >
                  <option value="">Select…</option>
                  {PRODUCT_TYPES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Quantity</label>
                <input
                  type="number"
                  min={1}
                  value={it.quantity}
                  onChange={(e) => updateItem(it.key, { quantity: Number(e.target.value) })}
                />
              </div>
              {PRODUCT_FIELDS.map((f) => (
                <div className="field" key={f.name}>
                  <label>
                    {f.name}
                    {f.unit ? ` (${f.unit})` : ""} {f.required && <span className="req">*</span>}
                  </label>
                  {renderField(f, it.product[f.name] || "", (v) => setProductField(it.key, f.name, v))}
                </div>
              ))}
            </div>

            {/* Diamond blocks */}
            <div className="row spread" style={{ marginTop: 8 }}>
              <label style={{ margin: 0 }}>Diamond details</label>
              <button type="button" className="btn ghost small" onClick={() => addDiamond(it.key)}>
                + Add diamond shape
              </button>
            </div>

            {it.diamonds.map((d, di) => {
              const shape = d.values["Diamond Shape"] || "";
              const sizeOptions = sizesForShape(shape);
              return (
                <div className="diamond-block" key={d.key}>
                  <div className="row spread">
                    <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>
                      Diamond shape {di + 1}
                    </span>
                    {it.diamonds.length > 1 && (
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() => removeDiamond(it.key, d.key)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid3" style={{ marginTop: 10 }}>
                    {DIAMOND_FIELDS.map((f) => {
                      const isSize = f.name === "Diamond Size";
                      return (
                        <div className="field" key={f.name}>
                          <label>
                            {f.name} {f.required && <span className="req">*</span>}
                            {isSize && shape ? <span className="muted"> · {shape}</span> : null}
                          </label>
                          {f.optionsByShape && !shape ? (
                            <select disabled>
                              <option>Pick a shape first…</option>
                            </select>
                          ) : isSize ? (
                            <>
                              <select
                                value={d.values["Diamond Size"] || ""}
                                onChange={(e) => {
                                  if (e.target.value === "__add_custom__") {
                                    setError(null);
                                    setSizeForm({
                                      itemKey: it.key,
                                      dKey: d.key,
                                      shape,
                                      sieve: "",
                                      mm: "",
                                      pointers: "",
                                    });
                                  } else {
                                    setDiamondField(it.key, d.key, "Diamond Size", e.target.value);
                                  }
                                }}
                              >
                                <option value="">—</option>
                                {sizeOptions.map((o) => (
                                  <option key={o} value={o}>
                                    {o}
                                  </option>
                                ))}
                                <option value="__add_custom__">➕ Add a new size…</option>
                              </select>
                              {sizeForm && sizeForm.itemKey === it.key && sizeForm.dKey === d.key && (
                                <div className="size-add-panel">
                                  <div className="size-add-title">
                                    Add a new {shape} size
                                  </div>
                                  <div className="size-add-row">
                                    <div className="field mini">
                                      <label>Sieve size</label>
                                      <input
                                        value={sizeForm.sieve}
                                        placeholder="+1-1.5"
                                        onChange={(e) =>
                                          setSizeForm((f) => (f ? { ...f, sieve: e.target.value } : f))
                                        }
                                      />
                                    </div>
                                    <div className="field mini">
                                      <label>MM</label>
                                      <input
                                        value={sizeForm.mm}
                                        placeholder="1.15 or 4.5*3.5"
                                        onChange={(e) =>
                                          setSizeForm((f) => (f ? { ...f, mm: e.target.value } : f))
                                        }
                                      />
                                    </div>
                                    <div className="field mini">
                                      <label>Pointers</label>
                                      <input
                                        value={sizeForm.pointers}
                                        placeholder="7"
                                        inputMode="decimal"
                                        onChange={(e) =>
                                          setSizeForm((f) => (f ? { ...f, pointers: e.target.value } : f))
                                        }
                                      />
                                    </div>
                                  </div>
                                  <div className="size-add-preview">
                                    {composeSizeLabel(sizeForm.sieve, sizeForm.mm, sizeForm.pointers) ? (
                                      <>
                                        Will add:{" "}
                                        <strong>
                                          {composeSizeLabel(sizeForm.sieve, sizeForm.mm, sizeForm.pointers)}
                                        </strong>
                                      </>
                                    ) : (
                                      "Fill in the fields above"
                                    )}
                                  </div>
                                  <div className="size-add-hint muted">
                                    Sieve is only for Round (leave blank otherwise). Pointers: 7 = 0.07 ct.
                                  </div>
                                  <div className="size-add-actions">
                                    <button
                                      type="button"
                                      className="btn gold small"
                                      onClick={submitCustomSize}
                                      disabled={savingSize}
                                    >
                                      Add size
                                    </button>
                                    <button
                                      type="button"
                                      className="btn ghost small"
                                      onClick={() => setSizeForm(null)}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              )}
                            </>
                          ) : (
                            renderField(
                              f,
                              d.values[f.name] || "",
                              (v) => setDiamondField(it.key, d.key, f.name, v),
                              sizeOptions
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Photos</h2>
        <div
          className="photo-upload-zone"
          onClick={() => photoInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && photoInputRef.current?.click()}
        >
          <div style={{ fontSize: 32, lineHeight: 1, marginBottom: 6 }}>📷</div>
          <div style={{ fontWeight: 600 }}>Click to add photos</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
            JPG, PNG, HEIC, WebP — any image format
          </div>
        </div>
        <input
          ref={photoInputRef}
          type="file"
          multiple
          accept="image/*"
          style={{ display: "none" }}
          onChange={handlePhotoSelect}
        />
        {photos.length > 0 && (
          <div className="photo-grid" style={{ marginTop: 14 }}>
            {photos.map((p) => (
              <div className="photo-thumb" key={p.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.localUrl} alt="order photo" />
                {p.uploading && (
                  <div className="photo-overlay">
                    <span style={{ fontSize: 11 }}>Uploading…</span>
                  </div>
                )}
                {p.failed && (
                  <div className="photo-overlay" style={{ background: "rgba(220,38,38,0.6)" }}>
                    <span style={{ fontSize: 11 }}>Failed</span>
                  </div>
                )}
                <button
                  type="button"
                  className="photo-remove"
                  onClick={(e) => { e.stopPropagation(); removePhoto(p.id); }}
                  aria-label="Remove photo"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="field">
          <label>Order Notes</label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Delivery deadline, special instructions, reference images sent on WhatsApp, etc."
          />
        </div>
      </div>

      <div className="row">
        <button className="btn gold" type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Create Order"}
        </button>
        <button type="button" className="btn ghost" onClick={() => router.push("/")}>
          Cancel
        </button>
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
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

    setSubmitting(true);
    const payload = {
      orderNumber,
      region: regionId,
      customerName,
      manufacturer,
      notes,
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
    router.push(`/orders/${encodeURIComponent(d.id)}`);
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
              const sizeOptions = DIAMOND_SIZES_BY_SHAPE[shape] || [];
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
                    {DIAMOND_FIELDS.map((f) => (
                      <div className="field" key={f.name}>
                        <label>
                          {f.name} {f.required && <span className="req">*</span>}
                          {f.name === "Diamond Size" && shape ? (
                            <span className="muted"> · {shape}</span>
                          ) : null}
                        </label>
                        {f.optionsByShape && !shape ? (
                          <select disabled>
                            <option>Pick a shape first…</option>
                          </select>
                        ) : (
                          renderField(
                            f,
                            d.values[f.name] || "",
                            (v) => setDiamondField(it.key, d.key, f.name, v),
                            sizeOptions
                          )
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
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

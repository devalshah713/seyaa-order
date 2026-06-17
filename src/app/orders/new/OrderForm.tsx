"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Attr = {
  id: string;
  name: string;
  inputType: "SELECT" | "MULTISELECT" | "NUMBER" | "TEXT";
  unit: string | null;
  required: boolean;
  options: string[];
};
type ProductType = { id: string; name: string; attributes: Attr[] };
type Region = { id: string; name: string; currency: string };

type Item = {
  key: number;
  productTypeId: string;
  quantity: number;
  specs: Record<string, string>; // attributeId -> value (MULTISELECT stored comma-joined)
};

let keyCounter = 1;
function blankItem(): Item {
  return { key: keyCounter++, productTypeId: "", quantity: 1, specs: {} };
}

export default function OrderForm() {
  const router = useRouter();
  const [regions, setRegions] = useState<Region[]>([]);
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [regionId, setRegionId] = useState("");
  const [notes, setNotes] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [items, setItems] = useState<Item[]>([blankItem()]);

  useEffect(() => {
    fetch("/api/meta")
      .then((r) => r.json())
      .then((d) => {
        setRegions(d.regions);
        setProductTypes(d.productTypes);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load form data.");
        setLoading(false);
      });
  }, []);

  function ptById(id: string) {
    return productTypes.find((p) => p.id === id);
  }

  function updateItem(key: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  function setSpec(key: number, attrId: string, value: string) {
    setItems((prev) =>
      prev.map((it) =>
        it.key === key ? { ...it, specs: { ...it.specs, [attrId]: value } } : it
      )
    );
  }

  // Toggle one option for a MULTISELECT attribute (Diamond Shape).
  function toggleMulti(key: number, attrId: string, option: string) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it;
        const current = it.specs[attrId]
          ? it.specs[attrId].split(", ").filter(Boolean)
          : [];
        const next = current.includes(option)
          ? current.filter((o) => o !== option)
          : [...current, option];
        return { ...it, specs: { ...it.specs, [attrId]: next.join(", ") } };
      })
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!regionId) return setError("Please choose a region.");
    if (!customerName.trim()) return setError("Please enter the customer name.");
    if (items.some((i) => !i.productTypeId))
      return setError("Please choose a product type for every item.");

    // required spec check
    for (const it of items) {
      const pt = ptById(it.productTypeId);
      if (!pt) continue;
      for (const a of pt.attributes) {
        if (a.required && !(it.specs[a.id] && it.specs[a.id].trim())) {
          return setError(`"${a.name}" is required for ${pt.name}.`);
        }
      }
    }

    setSubmitting(true);
    const payload = {
      regionId,
      notes,
      customer: { name: customerName },
      items: items.map((it) => ({
        productTypeId: it.productTypeId,
        quantity: Number(it.quantity) || 1,
        specs: Object.entries(it.specs).map(([attributeId, value]) => ({
          attributeId,
          value,
        })),
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
    router.push(`/orders/${d.id}`);
  }

  if (loading) return <div className="card">Loading…</div>;

  return (
    <form onSubmit={submit}>
      {error && (
        <div
          className="card"
          style={{ borderColor: "#dc2626", color: "#dc2626", background: "#fef2f2" }}
        >
          {error}
        </div>
      )}

      <div className="card">
        <h2>Customer & Region</h2>
        <div className="grid2">
          <div className="field">
            <label>
              Region <span className="req">*</span>
            </label>
            <select value={regionId} onChange={(e) => setRegionId(e.target.value)}>
              <option value="">Select region…</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.currency})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>
              Customer Name <span className="req">*</span>
            </label>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row spread">
          <h2>Products</h2>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => setItems([...items, blankItem()])}
          >
            + Add product
          </button>
        </div>

        {items.map((it, idx) => {
          const pt = ptById(it.productTypeId);
          return (
            <div className="item-block" key={it.key}>
              <div className="row spread">
                <strong>Item {idx + 1}</strong>
                {items.length > 1 && (
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => setItems(items.filter((x) => x.key !== it.key))}
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="grid2" style={{ marginTop: 12 }}>
                <div className="field">
                  <label>
                    Product Type <span className="req">*</span>
                  </label>
                  <select
                    value={it.productTypeId}
                    onChange={(e) =>
                      updateItem(it.key, { productTypeId: e.target.value, specs: {} })
                    }
                  >
                    <option value="">Select…</option>
                    {productTypes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
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
                    onChange={(e) =>
                      updateItem(it.key, { quantity: Number(e.target.value) })
                    }
                  />
                </div>
              </div>

              {pt && (
                <>
                  <label style={{ marginTop: 8 }}>Specifications</label>
                  <div className="grid3">
                    {pt.attributes.map((a) => (
                      <div className="field" key={a.id}>
                        <label>
                          {a.name}
                          {a.unit ? ` (${a.unit})` : ""}{" "}
                          {a.required && <span className="req">*</span>}
                        </label>

                        {a.inputType === "SELECT" && (
                          <select
                            value={it.specs[a.id] || ""}
                            onChange={(e) => setSpec(it.key, a.id, e.target.value)}
                          >
                            <option value="">—</option>
                            {a.options.map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        )}

                        {a.inputType === "MULTISELECT" && (
                          <div className="checkbox-group">
                            {a.options.map((o) => {
                              const selected = (it.specs[a.id] || "")
                                .split(", ")
                                .filter(Boolean)
                                .includes(o);
                              return (
                                <label key={o} className="checkbox-item">
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() => toggleMulti(it.key, a.id, o)}
                                  />
                                  <span>{o}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}

                        {(a.inputType === "NUMBER" || a.inputType === "TEXT") && (
                          <input
                            type={a.inputType === "NUMBER" ? "number" : "text"}
                            step="any"
                            value={it.specs[a.id] || ""}
                            onChange={(e) => setSpec(it.key, a.id, e.target.value)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
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
        <button
          type="button"
          className="btn ghost"
          onClick={() => router.push("/")}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/lib/formConfig";
import {
  ISSUE_HEADER_FIELDS,
  ISSUE_LINE_FIELDS,
  PRODUCT_TYPES,
  DIAMOND_SIZES_BY_SHAPE,
  parseNum,
  round2,
} from "@/lib/diamondIssueConfig";

type Line = { key: number; values: Record<string, string> };

let keyCounter = 1;
function blankLine(): Line {
  return { key: keyCounter++, values: {} };
}

export default function DiamondIssueForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [designNumber, setDesignNumber] = useState("");
  const [subDesignNo, setSubDesignNo] = useState("");
  const [product, setProduct] = useState("");
  const [memoNo, setMemoNo] = useState("");
  const [lines, setLines] = useState<Line[]>([blankLine()]);

  // Existing orders. The Order Number doubles as the Design Number, so picking
  // an order here links the whole journey and auto-fills the product.
  type OrderOption = { orderNumber: string; customerName: string; product: string };
  const [orders, setOrders] = useState<OrderOption[]>([]);

  useEffect(() => {
    fetch("/api/orders")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d?.orders)) setOrders(d.orders);
      })
      .catch(() => {});
  }, []);

  function pickOrder(orderNumber: string) {
    setDesignNumber(orderNumber);
    const o = orders.find((x) => x.orderNumber === orderNumber);
    if (o && o.product) setProduct(o.product);
  }

  // Staff-added sizes, keyed by shape (shared with the order form's list).
  const [customSizes, setCustomSizes] = useState<Record<string, string[]>>({});
  const [sizeForm, setSizeForm] = useState<{
    lineKey: number;
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

  function sizesForShape(shape: string): string[] {
    const base = DIAMOND_SIZES_BY_SHAPE[shape] || [];
    const extra = (customSizes[shape] || []).filter((s) => !base.includes(s));
    return [...base, ...extra];
  }

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

  function setLineField(lineKey: number, field: string, value: string) {
    setLines((prev) =>
      prev.map((ln) => {
        if (ln.key !== lineKey) return ln;
        const values = { ...ln.values, [field]: value };
        if (field === "Diamond Shape") values["Diamond Size"] = "";
        return { ...ln, values };
      })
    );
  }

  async function submitCustomSize() {
    if (!sizeForm) return;
    const { lineKey, shape } = sizeForm;
    const size = composeSizeLabel(sizeForm.sieve, sizeForm.mm, sizeForm.pointers);
    if (!size) {
      setError("Enter at least the MM size for the new diamond size.");
      return;
    }
    setCustomSizes((prev) => {
      const list = prev[shape] || [];
      if (list.some((s) => s.toLowerCase() === size.toLowerCase())) return prev;
      return { ...prev, [shape]: [...list, size] };
    });
    setLineField(lineKey, "Diamond Size", size);
    setSizeForm(null);
    setError(null);

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
      }
    } catch {
      // Still usable for this issue even if it couldn't be saved permanently.
    } finally {
      setSavingSize(false);
    }
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

  // Live totals preview (mirrors the server-side maths).
  let additionTotal = 0;
  let totalCarats = 0;
  const lineTotals = lines.map((ln) => {
    const total = round2(parseNum(ln.values["Price"]) * parseNum(ln.values["Diamond Carats"]));
    additionTotal += total;
    totalCarats += parseNum(ln.values["Diamond Carats"]);
    return total;
  });
  additionTotal = round2(additionTotal);
  const averagePrice = totalCarats > 0 ? round2(additionTotal / totalCarats) : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!memoNo.trim()) return setError("Please enter a Memo No.");
    if (!designNumber.trim()) return setError("Please select the order / design number.");

    const filled = lines.filter((ln) => ln.values["Diamond Shape"]);
    if (!filled.length) return setError("Add at least one diamond line with a shape.");
    for (const ln of filled) {
      for (const f of ISSUE_LINE_FIELDS) {
        if (f.required && !(ln.values[f.name] && ln.values[f.name].trim())) {
          return setError(`"${f.name}" is required for each diamond line.`);
        }
      }
    }

    setSubmitting(true);
    const payload = {
      memoNo,
      designNumber,
      subDesignNo,
      product,
      lines: filled.map((ln) => ({ values: ln.values })),
    };

    const res = await fetch("/api/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Failed to create issue.");
      setSubmitting(false);
      return;
    }
    const d = await res.json();
    router.push(`/issues/view?id=${encodeURIComponent(d.id)}`);
  }

  return (
    <form onSubmit={submit}>
      {error && (
        <div className="card" style={{ borderColor: "#dc2626", color: "#dc2626", background: "#fef2f2" }}>
          {error}
        </div>
      )}

      <div className="card">
        <h2>Issue Details</h2>
        <div className="grid3">
          <div className="field">
            <label>
              Memo No. <span className="req">*</span>
            </label>
            <input value={memoNo} onChange={(e) => setMemoNo(e.target.value)} placeholder="Memo / challan number" />
          </div>
          <div className="field">
            <label>
              Design Number (Order) <span className="req">*</span>
            </label>
            <select value={designNumber} onChange={(e) => pickOrder(e.target.value)}>
              <option value="">
                {orders.length ? "Select an order…" : "Loading orders…"}
              </option>
              {orders.map((o) => (
                <option key={o.orderNumber} value={o.orderNumber}>
                  {o.orderNumber}
                  {o.customerName ? ` — ${o.customerName}` : ""}
                </option>
              ))}
            </select>
            <span className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              The order number is the design number for the whole journey.
            </span>
          </div>
          <div className="field">
            <label>Sub Design No</label>
            <input value={subDesignNo} onChange={(e) => setSubDesignNo(e.target.value)} />
          </div>
          <div className="field">
            <label>Product</label>
            <select value={product} onChange={(e) => setProduct(e.target.value)}>
              <option value="">Select…</option>
              {PRODUCT_TYPES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row spread">
          <h2>Diamonds Issued</h2>
          <button type="button" className="btn ghost small" onClick={() => setLines([...lines, blankLine()])}>
            + Add diamond line
          </button>
        </div>

        {lines.map((ln, idx) => {
          const shape = ln.values["Diamond Shape"] || "";
          const sizeOptions = sizesForShape(shape);
          return (
            <div className="diamond-block" key={ln.key}>
              <div className="row spread">
                <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>
                  Diamond line {idx + 1}
                  {lineTotals[idx] ? ` · Total ${lineTotals[idx]}` : ""}
                </span>
                {lines.length > 1 && (
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => setLines(lines.filter((x) => x.key !== ln.key))}
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid3" style={{ marginTop: 10 }}>
                {ISSUE_LINE_FIELDS.map((f) => {
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
                            value={ln.values["Diamond Size"] || ""}
                            onChange={(e) => {
                              if (e.target.value === "__add_custom__") {
                                setError(null);
                                setSizeForm({ lineKey: ln.key, shape, sieve: "", mm: "", pointers: "" });
                              } else {
                                setLineField(ln.key, "Diamond Size", e.target.value);
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
                          {sizeForm && sizeForm.lineKey === ln.key && (
                            <div className="size-add-panel">
                              <div className="size-add-title">Add a new {shape} size</div>
                              <div className="size-add-row">
                                <div className="field mini">
                                  <label>Sieve size</label>
                                  <input
                                    value={sizeForm.sieve}
                                    placeholder="+1-1.5"
                                    onChange={(e) => setSizeForm((f) => (f ? { ...f, sieve: e.target.value } : f))}
                                  />
                                </div>
                                <div className="field mini">
                                  <label>MM</label>
                                  <input
                                    value={sizeForm.mm}
                                    placeholder="1.15 or 4.5*3.5"
                                    onChange={(e) => setSizeForm((f) => (f ? { ...f, mm: e.target.value } : f))}
                                  />
                                </div>
                                <div className="field mini">
                                  <label>Pointers</label>
                                  <input
                                    value={sizeForm.pointers}
                                    placeholder="7"
                                    inputMode="decimal"
                                    onChange={(e) => setSizeForm((f) => (f ? { ...f, pointers: e.target.value } : f))}
                                  />
                                </div>
                              </div>
                              <div className="size-add-preview">
                                {composeSizeLabel(sizeForm.sieve, sizeForm.mm, sizeForm.pointers) ? (
                                  <>
                                    Will add:{" "}
                                    <strong>{composeSizeLabel(sizeForm.sieve, sizeForm.mm, sizeForm.pointers)}</strong>
                                  </>
                                ) : (
                                  "Fill in the fields above"
                                )}
                              </div>
                              <div className="size-add-hint muted">
                                Sieve is only for Round (leave blank otherwise). Pointers: 7 = 0.07 ct.
                              </div>
                              <div className="size-add-actions">
                                <button type="button" className="btn gold small" onClick={submitCustomSize} disabled={savingSize}>
                                  Add size
                                </button>
                                <button type="button" className="btn ghost small" onClick={() => setSizeForm(null)}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        renderField(
                          f,
                          ln.values[f.name] || "",
                          (v) => setLineField(ln.key, f.name, v),
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

        <div className="row spread" style={{ marginTop: 14, fontWeight: 600 }}>
          <span>Addition of Total Price</span>
          <span>{additionTotal || 0}</span>
        </div>
        <div className="row spread" style={{ marginTop: 4 }}>
          <span className="muted">Average Price (per carat)</span>
          <span className="muted">{averagePrice || 0}</span>
        </div>
      </div>

      <div className="row">
        <button className="btn gold" type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Create Issue"}
        </button>
        <button type="button" className="btn ghost" onClick={() => router.push("/issues")}>
          Cancel
        </button>
      </div>
    </form>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import OrderCombobox, { OrderOption } from "@/app/issues/new/OrderCombobox";
import OptionInput from "./OptionInput";
import {
  SHAPE_OPTIONS,
  MANUFACTURERS,
  DIAMOND_SIZES_BY_SHAPE,
  parseNum,
  round2,
  pointerFor,
} from "@/lib/stockConfig";

type Stone = {
  shape: string;
  sieveSize: string;
  pcs: string;
  weightBreakup: string;
  diamondPriceUsd: string;
  diamondPriceInr: string;
};
type Options = { gold: string[]; location: string[]; inch: string[] };

function blankStone(): Stone {
  return { shape: "", sieveSize: "", pcs: "", weightBreakup: "", diamondPriceUsd: "", diamondPriceInr: "" };
}

function isoToDdmmyyyy(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export default function StockInForm({ initialDesign = "" }: { initialDesign?: string }) {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [options, setOptions] = useState<Options>({ gold: [], location: [], inch: [] });
  const [customSizes, setCustomSizes] = useState<Record<string, string[]>>({});

  const todayIso = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(todayIso);
  const [designNumber, setDesignNumber] = useState(initialDesign);
  const [designName, setDesignName] = useState("");
  const [location, setLocation] = useState("");
  const [goldDetails, setGoldDetails] = useState("");
  const [inchSize, setInchSize] = useState("");
  const [grossWeight, setGrossWeight] = useState("");
  const [netWeight, setNetWeight] = useState("");
  const [manufacturerName, setManufacturerName] = useState("");
  const [productCode, setProductCode] = useState("");
  const [goldPriceUsd, setGoldPriceUsd] = useState("");
  const [laborUsd, setLaborUsd] = useState("");
  const [goldPriceInr, setGoldPriceInr] = useState("");
  const [laborInr, setLaborInr] = useState("");
  const [comments, setComments] = useState("");
  const [stones, setStones] = useState<Stone[]>([blankStone()]);

  const [loadingDesign, setLoadingDesign] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Reference data: orders, the saved option lists, custom diamond sizes.
  useEffect(() => {
    fetch("/api/orders").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (Array.isArray(d?.orders)) setOrders(d.orders);
    }).catch(() => {});
    fetch("/api/stock-options").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.options) setOptions(d.options);
    }).catch(() => {});
    fetch("/api/sizes").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.sizes) setCustomSizes(d.sizes);
    }).catch(() => {});
  }, []);

  function sizesForShape(shape: string): string[] {
    const base = DIAMOND_SIZES_BY_SHAPE[shape] || [];
    const extra = (customSizes[shape] || []).filter((s) => !base.includes(s));
    return [...base, ...extra];
  }

  // Pick a design → auto-fill manufacturer (from the order) and the diamond
  // breakup (the diamonds actually used, from this design's Diamond Issues).
  const pickDesign = useCallback(async (design: string) => {
    setDesignNumber(design);
    setError(null);
    setDone(null);
    if (!design) return;
    setLoadingDesign(true);
    try {
      const [orderRes, issuesRes] = await Promise.all([
        fetch(`/api/orders?id=${encodeURIComponent(design)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/issues?design=${encodeURIComponent(design)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (orderRes?.order?.manufacturer) setManufacturerName(orderRes.order.manufacturer);

      const memos: Array<{ bags: Array<{ shape: string; size: string; pcs: string; carats: string; ctsUsed: string; pcsUsed: string }> }> =
        Array.isArray(issuesRes?.memos) ? issuesRes.memos : [];
      const fetched: Stone[] = [];
      for (const m of memos) {
        for (const b of m.bags || []) {
          fetched.push({
            shape: b.shape || "",
            sieveSize: b.size || "",
            pcs: b.pcsUsed || b.pcs || "",
            weightBreakup: b.ctsUsed || b.carats || "",
            diamondPriceUsd: "",
            diamondPriceInr: "",
          });
        }
      }
      setStones(fetched.length ? fetched : [blankStone()]);
    } catch {
      setError("Could not load this design's details.");
    } finally {
      setLoadingDesign(false);
    }
  }, []);

  useEffect(() => {
    if (initialDesign) pickDesign(initialDesign);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setStone(i: number, field: keyof Stone, value: string) {
    setStones((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));
  }
  function addStone() { setStones((prev) => [...prev, blankStone()]); }
  function removeStone(i: number) { setStones((prev) => prev.filter((_, idx) => idx !== i)); }

  async function saveOption(kind: "gold" | "location" | "inch", value: string) {
    try {
      const res = await fetch("/api/stock-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, value }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d?.options) setOptions(d.options);
      }
    } catch {/* still usable for this entry even if not saved */}
  }

  async function saveSize(shape: string, size: string) {
    if (!shape) { setError("Pick a shape before saving a new size."); return; }
    try {
      const res = await fetch("/api/sizes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shape, size }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d?.sizes) setCustomSizes(d.sizes);
      }
    } catch {/* ignore */}
  }

  // Live totals (mirrors the server-side maths).
  const totalDiamondWeight = round2(stones.reduce((s, st) => s + parseNum(st.weightBreakup), 0));
  const totalDiaPcs = stones.reduce((s, st) => s + parseNum(st.pcs), 0);
  const diaUsd = round2(stones.reduce((s, st) => s + parseNum(st.diamondPriceUsd), 0));
  const diaInr = round2(stones.reduce((s, st) => s + parseNum(st.diamondPriceInr), 0));
  const totalUsd = round2(diaUsd + parseNum(goldPriceUsd) + parseNum(laborUsd));
  const totalInr = round2(diaInr + parseNum(goldPriceInr) + parseNum(laborInr));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!designNumber.trim()) return setError("Please pick a Design Number.");

    setSubmitting(true);
    const payload = {
      date: isoToDdmmyyyy(date),
      designName,
      designNumber,
      location,
      goldDetails,
      inchSize,
      grossWeight,
      netWeight,
      manufacturerName,
      productCode,
      goldPriceUsd,
      laborUsd,
      goldPriceInr,
      laborInr,
      comments,
      stones: stones.map((s) => ({
        ...s,
        pointers: (() => { const p = pointerFor(s.weightBreakup, s.pcs); return p ? String(p) : ""; })(),
      })),
    };
    const res = await fetch("/api/stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSubmitting(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Failed to record stock in.");
      return;
    }
    const d = await res.json();
    setDone(d.stockNo || "");
    router.refresh();
  }

  if (done !== null) {
    return (
      <div className="card" style={{ borderColor: "#16a34a", background: "#f0fdf4" }}>
        <h2 style={{ marginTop: 0 }}>✅ Stock recorded</h2>
        <p>
          Saved as <b>Stock No. {done}</b> for design <b>{designNumber}</b>. It has been written to the
          Stock Entry sheet with all weights, the diamond breakup and pricing.
        </p>
        <div className="row" style={{ marginTop: 8 }}>
          <Link className="btn gold" href="/stock">View stock</Link>
          <button
            className="btn ghost"
            type="button"
            onClick={() => {
              setDone(null);
              setDesignNumber("");
              setDesignName(""); setLocation(""); setGoldDetails(""); setInchSize("");
              setGrossWeight(""); setNetWeight(""); setManufacturerName(""); setProductCode("");
              setGoldPriceUsd(""); setLaborUsd(""); setGoldPriceInr(""); setLaborInr("");
              setComments(""); setStones([blankStone()]);
            }}
          >
            Record another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      {error && (
        <div className="card" style={{ borderColor: "#dc2626", color: "#dc2626", background: "#fef2f2" }}>
          {error}
        </div>
      )}

      {/* Piece details */}
      <div className="card">
        <div className="row spread">
          <h2>Piece Details</h2>
          {designNumber && (
            <Link href={`/audit?order=${encodeURIComponent(designNumber)}`} target="_blank" className="btn ghost small">
              Audit Trail for {designNumber}
            </Link>
          )}
        </div>
        <div className="grid3">
          <div className="field">
            <label>Design Number <span className="req">*</span></label>
            <OrderCombobox orders={orders} value={designNumber} onSelect={pickDesign} loading={!orders.length} />
            <span className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {loadingDesign ? "Loading design details…" : "Picking a design auto-fills the maker & diamond breakup."}
            </span>
          </div>
          <div className="field">
            <label>Design Name</label>
            <input value={designName} onChange={(e) => setDesignName(e.target.value)} placeholder="Style / design name" />
          </div>
          <div className="field">
            <label>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Manufacturer Name</label>
            <OptionInput value={manufacturerName} onChange={setManufacturerName} options={MANUFACTURERS} placeholder="Maker / party" />
          </div>
          <div className="field">
            <label>Location</label>
            <OptionInput value={location} onChange={setLocation} options={options.location} onSaveNew={(v) => saveOption("location", v)} placeholder="Where it's stored" />
          </div>
          <div className="field">
            <label>Product Code</label>
            <input value={productCode} onChange={(e) => setProductCode(e.target.value)} placeholder="SKU / product code" />
          </div>
          <div className="field">
            <label>Gold Details</label>
            <OptionInput value={goldDetails} onChange={setGoldDetails} options={options.gold} onSaveNew={(v) => saveOption("gold", v)} placeholder="e.g. 18KT Yellow" />
          </div>
          <div className="field">
            <label>Inch Size</label>
            <OptionInput value={inchSize} onChange={setInchSize} options={options.inch} onSaveNew={(v) => saveOption("inch", v)} placeholder="Ring/length size" />
          </div>
        </div>
      </div>

      {/* Weights */}
      <div className="card">
        <h2>Weights</h2>
        <div className="grid3">
          <div className="field">
            <label>Gross Weight</label>
            <input type="number" step="any" value={grossWeight} onChange={(e) => setGrossWeight(e.target.value)} placeholder="grams" />
          </div>
          <div className="field">
            <label>Net Weight</label>
            <input type="number" step="any" value={netWeight} onChange={(e) => setNetWeight(e.target.value)} placeholder="grams" />
          </div>
          <div className="field">
            <label>Total Diamond Weight</label>
            <input value={totalDiamondWeight || ""} readOnly placeholder="auto" style={{ background: "#f8fafc" }} />
            <span className="muted" style={{ fontSize: 12, marginTop: 4 }}>Auto = sum of breakup (ct) · {totalDiaPcs || 0} pcs</span>
          </div>
        </div>
      </div>

      {/* Diamond breakup */}
      <div className="card" style={{ overflowX: "auto" }}>
        <div className="row spread">
          <div>
            <h2 style={{ margin: 0 }}>Diamond Breakup</h2>
            <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              One line per shape/size. Auto-filled from the diamonds used — edit, or add lines.
            </p>
          </div>
          <button type="button" className="btn ghost small" onClick={addStone}>+ Add line</button>
        </div>
        <table style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Shape</th>
              <th>Sieve / Size</th>
              <th>Dia Pcs</th>
              <th>Weight Breakup (ct)</th>
              <th>Pointers</th>
              <th>Diamond Price ($)</th>
              <th>Diamond Price (₹)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {stones.map((s, i) => {
              const ptr = pointerFor(s.weightBreakup, s.pcs);
              return (
                <tr key={i}>
                  <td>
                    <select value={s.shape} onChange={(e) => { setStone(i, "shape", e.target.value); setStone(i, "sieveSize", ""); }} style={{ width: 120 }}>
                      <option value="">—</option>
                      {SHAPE_OPTIONS.map((sh) => <option key={sh} value={sh}>{sh}</option>)}
                    </select>
                  </td>
                  <td>
                    <OptionInput
                      value={s.sieveSize}
                      onChange={(v) => setStone(i, "sieveSize", v)}
                      options={sizesForShape(s.shape)}
                      onSaveNew={(v) => saveSize(s.shape, v)}
                      placeholder={s.shape ? "size" : "pick shape"}
                      style={{ width: 150 }}
                    />
                  </td>
                  <td><input type="number" step="any" value={s.pcs} onChange={(e) => setStone(i, "pcs", e.target.value)} style={{ width: 80 }} /></td>
                  <td><input type="number" step="any" value={s.weightBreakup} onChange={(e) => setStone(i, "weightBreakup", e.target.value)} style={{ width: 110 }} /></td>
                  <td style={{ fontWeight: 600, color: ptr ? "#0891b2" : undefined }}>{ptr || "—"}</td>
                  <td><input type="number" step="any" value={s.diamondPriceUsd} onChange={(e) => setStone(i, "diamondPriceUsd", e.target.value)} style={{ width: 110 }} /></td>
                  <td><input type="number" step="any" value={s.diamondPriceInr} onChange={(e) => setStone(i, "diamondPriceInr", e.target.value)} style={{ width: 110 }} /></td>
                  <td>
                    {stones.length > 1 && (
                      <button type="button" className="btn ghost small" onClick={() => removeStone(i)}>✕</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pricing */}
      <div className="card" style={{ overflowX: "auto" }}>
        <h2>Pricing</h2>
        <table>
          <thead>
            <tr><th></th><th>Diamond</th><th>Gold</th><th>Labor</th><th>Total</th></tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ fontWeight: 700 }}>USD ($)</td>
              <td className="muted">{diaUsd || 0} <span style={{ fontSize: 11 }}>(auto)</span></td>
              <td><input type="number" step="any" value={goldPriceUsd} onChange={(e) => setGoldPriceUsd(e.target.value)} style={{ width: 110 }} /></td>
              <td><input type="number" step="any" value={laborUsd} onChange={(e) => setLaborUsd(e.target.value)} style={{ width: 110 }} /></td>
              <td style={{ fontWeight: 700 }}>{totalUsd || 0}</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700 }}>INR (₹)</td>
              <td className="muted">{diaInr || 0} <span style={{ fontSize: 11 }}>(auto)</span></td>
              <td><input type="number" step="any" value={goldPriceInr} onChange={(e) => setGoldPriceInr(e.target.value)} style={{ width: 110 }} /></td>
              <td><input type="number" step="any" value={laborInr} onChange={(e) => setLaborInr(e.target.value)} style={{ width: 110 }} /></td>
              <td style={{ fontWeight: 700 }}>{totalInr || 0}</td>
            </tr>
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Diamond price = sum of the breakup lines above. Total = Diamond + Gold + Labor (per currency).
        </p>
      </div>

      <div className="card">
        <div className="field">
          <label>Comments / Remarks</label>
          <textarea rows={3} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Any notes about this piece" />
        </div>
      </div>

      <div className="row">
        <button className="btn gold" type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Record Stock In"}
        </button>
        <button type="button" className="btn ghost" onClick={() => router.push("/stock")}>Cancel</button>
      </div>
    </form>
  );
}

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
import {
  PRICE_OPTIONS,
  findPrice,
  isPolkiCode,
  GOLD_RATES,
  LABOUR_RATES,
  karatFromGoldDetails,
} from "@/lib/stockPriceList";
import type { StockEntry } from "@/lib/stockStore";

type Stone = {
  shape: string;
  sieveSize: string;
  pcs: string;
  weightBreakup: string;
  productCode: string;
  diamondPriceUsd: string;
  diamondPriceInr: string;
  priceTouched?: boolean; // user manually edited the price → stop auto-overwrite
};
type Options = { gold: string[]; location: string[]; inch: string[] };

function blankStone(): Stone {
  return { shape: "", sieveSize: "", pcs: "", weightBreakup: "", productCode: "", diamondPriceUsd: "", diamondPriceInr: "" };
}

// Diamond price for a line = code's per-carat price × the line's carat weight.
function pricedStone(s: Stone): Stone {
  if (s.priceTouched) return s;
  const pe = findPrice(s.productCode);
  const wt = parseNum(s.weightBreakup);
  if (!pe || wt <= 0) return s;
  return { ...s, diamondPriceUsd: String(round2(pe.usd * wt)), diamondPriceInr: String(round2(pe.inr * wt)) };
}

function isoToDdmmyyyy(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
function ddmmyyyyToIso(s: string): string {
  const m = (s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

export default function StockInForm({
  initialDesign = "",
  initialEntry = null,
}: {
  initialDesign?: string;
  initialEntry?: StockEntry | null;
}) {
  const router = useRouter();
  const editing = !!initialEntry;
  const editingStockNo = initialEntry?.stockNo || "";

  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [options, setOptions] = useState<Options>({ gold: [], location: [], inch: [] });
  const [customSizes, setCustomSizes] = useState<Record<string, string[]>>({});

  const [customStockNo, setCustomStockNo] = useState("");
  const todayIso = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(initialEntry ? (ddmmyyyyToIso(initialEntry.date) || todayIso) : todayIso);
  const [designNumber, setDesignNumber] = useState(initialEntry?.designNumber || initialDesign);
  const [designName, setDesignName] = useState(initialEntry?.designName || "");
  const [location, setLocation] = useState(initialEntry?.location || "");
  const [goldDetails, setGoldDetails] = useState(initialEntry?.goldDetails || "");
  const [inchSize, setInchSize] = useState(initialEntry?.inchSize || "");
  const [grossWeight, setGrossWeight] = useState(initialEntry?.grossWeight || "");
  const [netWeight, setNetWeight] = useState(initialEntry?.netWeight || "");
  const [manufacturerName, setManufacturerName] = useState(initialEntry?.manufacturerName || "");
  const [goldPriceUsd, setGoldPriceUsd] = useState(initialEntry?.goldPriceUsd || "");
  const [laborUsd, setLaborUsd] = useState(initialEntry?.laborUsd || "");
  const [goldPriceInr, setGoldPriceInr] = useState(initialEntry?.goldPriceInr || "");
  const [laborInr, setLaborInr] = useState(initialEntry?.laborInr || "");
  const [comments, setComments] = useState(initialEntry?.comments || "");
  const [stones, setStones] = useState<Stone[]>(
    initialEntry && initialEntry.stones.length
      ? initialEntry.stones.map((s) => ({
          shape: s.shape,
          sieveSize: s.sieveSize,
          pcs: s.pcs,
          weightBreakup: s.weightBreakup,
          productCode: s.productCode,
          diamondPriceUsd: s.diamondPriceUsd,
          diamondPriceInr: s.diamondPriceInr,
          priceTouched: true, // keep stored prices unless the code is re-picked
        }))
      : [blankStone()]
  );
  // When editing, keep the stored gold/labour as-is (don't auto-overwrite).
  const [autoRates, setAutoRates] = useState(!editing);

  const [loadingDesign, setLoadingDesign] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

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
            productCode: "",
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
    if (!editing && initialDesign) pickDesign(initialDesign);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-calc gold & labour from the India rate card (per gram × weight).
  const karat = karatFromGoldDetails(goldDetails);
  const hasPolki = stones.some((s) => isPolkiCode(s.productCode));
  const rateWeight = parseNum(netWeight) || parseNum(grossWeight);
  useEffect(() => {
    if (!autoRates) return;
    const w = parseNum(netWeight) || parseNum(grossWeight);
    if (w > 0 && karat && GOLD_RATES[karat]) {
      setGoldPriceUsd(String(round2(GOLD_RATES[karat].usd * w)));
      setGoldPriceInr(String(round2(GOLD_RATES[karat].inr * w)));
    } else {
      setGoldPriceUsd(""); setGoldPriceInr("");
    }
    if (w > 0) {
      const lr = hasPolki ? LABOUR_RATES.polki : LABOUR_RATES.normal;
      setLaborUsd(String(round2(lr.usd * w)));
      setLaborInr(String(round2(lr.inr * w)));
    } else {
      setLaborUsd(""); setLaborInr("");
    }
  }, [autoRates, netWeight, grossWeight, karat, hasPolki]);

  // --- stone editing -------------------------------------------------------
  function updateStone(i: number, patch: Partial<Stone>, recomputePrice: boolean) {
    setStones((prev) => prev.map((s, idx) => {
      if (idx !== i) return s;
      let next = { ...s, ...patch };
      if (recomputePrice) next = pricedStone(next);
      return next;
    }));
  }
  function addStone() { setStones((prev) => [...prev, blankStone()]); }
  function removeStone(i: number) { setStones((prev) => prev.filter((_, idx) => idx !== i)); }

  async function saveOption(kind: "gold" | "location" | "inch", value: string) {
    try {
      const res = await fetch("/api/stock-options", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, value }),
      });
      if (res.ok) { const d = await res.json(); if (d?.options) setOptions(d.options); }
    } catch {/* still usable for this entry */}
  }
  async function saveSize(shape: string, size: string) {
    if (!shape) { setError("Pick a shape before saving a new size."); return; }
    try {
      const res = await fetch("/api/sizes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shape, size }),
      });
      if (res.ok) { const d = await res.json(); if (d?.sizes) setCustomSizes(d.sizes); }
    } catch {/* ignore */}
  }

  // Live totals.
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
      stockNo: editing ? editingStockNo : customStockNo.trim(),
      editing,
      date: isoToDdmmyyyy(date),
      designName, designNumber, location, goldDetails, inchSize,
      grossWeight, netWeight, manufacturerName,
      goldPriceUsd, laborUsd, goldPriceInr, laborInr, comments,
      stones: stones.map((s) => ({
        shape: s.shape,
        sieveSize: s.sieveSize,
        pcs: s.pcs,
        weightBreakup: s.weightBreakup,
        productCode: s.productCode,
        pointers: (() => { const p = pointerFor(s.weightBreakup, s.pcs); return p ? String(p) : ""; })(),
        diamondPriceUsd: s.diamondPriceUsd,
        diamondPriceInr: s.diamondPriceInr,
      })),
    };
    const res = await fetch("/api/stock", {
      method: "POST", headers: { "Content-Type": "application/json" },
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
        <h2 style={{ marginTop: 0 }}>✅ {editing ? "Stock updated" : "Stock recorded"}</h2>
        <p>Saved as <b>Stock No. {done}</b> for design <b>{designNumber}</b>.</p>
        <div className="row" style={{ marginTop: 8 }}>
          <Link className="btn gold" href="/stock">View stock</Link>
          <button className="btn ghost" type="button" onClick={() => {
            setDone(null); setCustomStockNo(""); setDesignNumber(""); setDesignName(""); setLocation(""); setGoldDetails(""); setInchSize("");
            setGrossWeight(""); setNetWeight(""); setManufacturerName("");
            setGoldPriceUsd(""); setLaborUsd(""); setGoldPriceInr(""); setLaborInr("");
            setComments(""); setStones([blankStone()]);
          }}>Record another</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      {error && (
        <div className="card" style={{ borderColor: "#dc2626", color: "#dc2626", background: "#fef2f2" }}>{error}</div>
      )}

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
            <label>Stock No.</label>
            {editing ? (
              <input value={editingStockNo} readOnly style={{ background: "#f8fafc" }} />
            ) : (
              <input
                value={customStockNo}
                onChange={(e) => setCustomStockNo(e.target.value)}
                placeholder="Leave blank to auto-number"
              />
            )}
            {!editing && (
              <span className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Enter your own stock number, or leave blank to auto-number.
              </span>
            )}
          </div>
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
            <label>Gold Details</label>
            <OptionInput value={goldDetails} onChange={setGoldDetails} options={options.gold} onSaveNew={(v) => saveOption("gold", v)} placeholder="e.g. 18KT Yellow" />
          </div>
          <div className="field">
            <label>Inch Size</label>
            <OptionInput value={inchSize} onChange={setInchSize} options={options.inch} onSaveNew={(v) => saveOption("inch", v)} placeholder="Ring/length size" />
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Weights</h2>
        <div className="grid3">
          <div className="field">
            <label>Gross Weight</label>
            <input type="number" step="any" value={grossWeight} onChange={(e) => setGrossWeight(e.target.value)} placeholder="grams" />
          </div>
          <div className="field">
            <label>Net Weight</label>
            <input type="number" step="any" value={netWeight} onChange={(e) => setNetWeight(e.target.value)} placeholder="grams (gold)" />
            <span className="muted" style={{ fontSize: 12, marginTop: 4 }}>Used for gold & labour pricing.</span>
          </div>
          <div className="field">
            <label>Total Diamond Weight</label>
            <input value={totalDiamondWeight || ""} readOnly placeholder="auto" style={{ background: "#f8fafc" }} />
            <span className="muted" style={{ fontSize: 12, marginTop: 4 }}>Auto = sum of breakup (ct) · {totalDiaPcs || 0} pcs</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row spread">
          <div>
            <h2 style={{ margin: 0 }}>Diamond Breakup</h2>
            <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              Pick a <b>Product Code</b> and the Diamond Price ($ & ₹) auto-fills = code rate × weight. Editable.
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
              <th>Weight (ct)</th>
              <th>Pointers</th>
              <th>Product Code</th>
              <th>Diamond Price ($)</th>
              <th>Diamond Price (₹)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {stones.map((s, i) => {
              const ptr = pointerFor(s.weightBreakup, s.pcs);
              const pe = findPrice(s.productCode);
              return (
                <tr key={i}>
                  <td>
                    <select value={s.shape} onChange={(e) => updateStone(i, { shape: e.target.value, sieveSize: "" }, false)} style={{ width: 110 }}>
                      <option value="">—</option>
                      {SHAPE_OPTIONS.map((sh) => <option key={sh} value={sh}>{sh}</option>)}
                    </select>
                  </td>
                  <td>
                    <OptionInput value={s.sieveSize} onChange={(v) => updateStone(i, { sieveSize: v }, false)}
                      options={sizesForShape(s.shape)} onSaveNew={(v) => saveSize(s.shape, v)}
                      placeholder={s.shape ? "size" : "pick shape"} style={{ width: 140 }} />
                  </td>
                  <td><input type="number" step="any" value={s.pcs} onChange={(e) => updateStone(i, { pcs: e.target.value }, false)} style={{ width: 70 }} /></td>
                  <td><input type="number" step="any" value={s.weightBreakup} onChange={(e) => updateStone(i, { weightBreakup: e.target.value }, true)} style={{ width: 90 }} /></td>
                  <td style={{ fontWeight: 600, color: ptr ? "#0891b2" : undefined }}>{ptr || "—"}</td>
                  <td>
                    <OptionInput value={s.productCode} onChange={(v) => updateStone(i, { productCode: v, priceTouched: false }, true)}
                      options={[]} items={PRICE_OPTIONS} placeholder="code" style={{ width: 150 }} />
                    {pe ? (
                      <span className="muted" style={{ fontSize: 11, display: "block", marginTop: 2 }}>
                        {pe.label} · ${pe.usd}/ct · ₹{pe.inr}/ct
                      </span>
                    ) : s.productCode ? (
                      <span style={{ fontSize: 11, color: "#dc2626", display: "block", marginTop: 2 }}>unknown code</span>
                    ) : null}
                  </td>
                  <td><input type="number" step="any" value={s.diamondPriceUsd} onChange={(e) => updateStone(i, { diamondPriceUsd: e.target.value, priceTouched: true }, false)} style={{ width: 100 }} /></td>
                  <td><input type="number" step="any" value={s.diamondPriceInr} onChange={(e) => updateStone(i, { diamondPriceInr: e.target.value, priceTouched: true }, false)} style={{ width: 100 }} /></td>
                  <td>{stones.length > 1 && <button type="button" className="btn ghost small" onClick={() => removeStone(i)}>✕</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <div className="row spread">
          <h2 style={{ margin: 0 }}>Pricing</h2>
          <label className="row" style={{ gap: 6, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={autoRates} onChange={(e) => setAutoRates(e.target.checked)} style={{ width: "auto" }} />
            Auto-calc gold &amp; labour from India rate card
          </label>
        </div>
        {autoRates && (
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            {karat ? `Gold ${karat}` : "Gold (add 14KT/18KT in Gold Details)"} ·{" "}
            Labour {hasPolki ? "Polki" : "standard"} · weight {rateWeight || 0} g
            {!rateWeight ? " — enter Net/Gross weight" : ""}
          </p>
        )}
        <table>
          <thead>
            <tr><th></th><th>Diamond</th><th>Gold</th><th>Labor</th><th>Total</th></tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ fontWeight: 700 }}>USD ($)</td>
              <td className="muted">{diaUsd || 0} <span style={{ fontSize: 11 }}>(auto)</span></td>
              <td><input type="number" step="any" value={goldPriceUsd} readOnly={autoRates} onChange={(e) => setGoldPriceUsd(e.target.value)} style={{ width: 110, background: autoRates ? "#f8fafc" : undefined }} /></td>
              <td><input type="number" step="any" value={laborUsd} readOnly={autoRates} onChange={(e) => setLaborUsd(e.target.value)} style={{ width: 110, background: autoRates ? "#f8fafc" : undefined }} /></td>
              <td style={{ fontWeight: 700 }}>{totalUsd || 0}</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700 }}>INR (₹)</td>
              <td className="muted">{diaInr || 0} <span style={{ fontSize: 11 }}>(auto)</span></td>
              <td><input type="number" step="any" value={goldPriceInr} readOnly={autoRates} onChange={(e) => setGoldPriceInr(e.target.value)} style={{ width: 110, background: autoRates ? "#f8fafc" : undefined }} /></td>
              <td><input type="number" step="any" value={laborInr} readOnly={autoRates} onChange={(e) => setLaborInr(e.target.value)} style={{ width: 110, background: autoRates ? "#f8fafc" : undefined }} /></td>
              <td style={{ fontWeight: 700 }}>{totalInr || 0}</td>
            </tr>
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Diamond = sum of breakup lines. Total = Diamond + Gold + Labor (per currency).
        </p>
      </div>

      <div className="card">
        <div className="field">
          <label>Comments / Remarks</label>
          <textarea rows={3} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Any notes about this piece" />
        </div>
      </div>

      <div className="row">
        <button className="btn gold" type="submit" disabled={submitting}>{submitting ? "Saving…" : editing ? "Update Stock" : "Record Stock In"}</button>
        <button type="button" className="btn ghost" onClick={() => router.push("/stock")}>Cancel</button>
      </div>
    </form>
  );
}

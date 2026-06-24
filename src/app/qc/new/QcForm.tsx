"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import OptionInput from "@/app/stock/new/OptionInput";
import { QC_CHECKS, deriveResult } from "@/lib/qcConfig";

type StockLite = {
  stockNo: string; designName: string; goldDetails: string; designNumber: string;
  location: string; inchSize: string; grossWeight: string; netWeight: string;
  totalDiamondWeight: string; totalDiaPcs: string; manufacturerName: string;
};
type Detail = Omit<StockLite, "stockNo">;
type Answer = { value: string; remark: string };
export type QcInitial = {
  stockNo: string; designName: string; designNumber: string; goldDetails: string;
  location: string; inchSize: string; grossWeight: string; netWeight: string;
  totalDiamondWeight: string; totalDiaPcs: string; manufacturerName: string;
  date: string; checkedBy: string; comments: string;
  items: { check: string; value: string; remark: string }[];
};

function isoToDdmmyyyy(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
function ddmmyyyyToIso(s: string): string {
  const m = (s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

const EMPTY_DETAIL: Detail = {
  designName: "", goldDetails: "", designNumber: "", location: "", inchSize: "",
  grossWeight: "", netWeight: "", totalDiamondWeight: "", totalDiaPcs: "", manufacturerName: "",
};

const RESULT_STYLE: Record<string, { bg: string; label: string }> = {
  PASS: { bg: "#16a34a", label: "Pass" },
  FAIL: { bg: "#dc2626", label: "Fail" },
  PENDING: { bg: "#d97706", label: "Pending" },
};

export default function QcForm({ initial = null }: { initial?: QcInitial | null }) {
  const router = useRouter();
  const editing = !!initial;

  const [stocks, setStocks] = useState<StockLite[]>([]);
  const [stockNo, setStockNo] = useState(initial?.stockNo || "");
  const [detail, setDetail] = useState<Detail>(
    initial
      ? {
          designName: initial.designName, goldDetails: initial.goldDetails, designNumber: initial.designNumber,
          location: initial.location, inchSize: initial.inchSize, grossWeight: initial.grossWeight,
          netWeight: initial.netWeight, totalDiamondWeight: initial.totalDiamondWeight,
          totalDiaPcs: initial.totalDiaPcs, manufacturerName: initial.manufacturerName,
        }
      : EMPTY_DETAIL
  );

  const todayIso = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(initial ? (ddmmyyyyToIso(initial.date) || todayIso) : todayIso);
  const [checkedBy, setCheckedBy] = useState(initial?.checkedBy || "");
  const [comments, setComments] = useState(initial?.comments || "");

  const [answers, setAnswers] = useState<Record<string, Answer>>(() => {
    const init: Record<string, Answer> = {};
    QC_CHECKS.forEach((c) => { init[c] = { value: "", remark: "" }; });
    initial?.items.forEach((it) => { if (init[it.check]) init[it.check] = { value: it.value, remark: it.remark }; });
    return init;
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/stock").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (Array.isArray(d?.stocks)) setStocks(d.stocks);
    }).catch(() => {});
  }, []);

  const pickStock = useCallback((no: string, list: StockLite[]) => {
    setStockNo(no);
    const s = list.find((x) => x.stockNo === no);
    if (s) {
      setDetail({
        designName: s.designName || "", goldDetails: s.goldDetails || "", designNumber: s.designNumber || "",
        location: s.location || "", inchSize: s.inchSize || "", grossWeight: s.grossWeight || "",
        netWeight: s.netWeight || "", totalDiamondWeight: s.totalDiamondWeight || "",
        totalDiaPcs: s.totalDiaPcs || "", manufacturerName: s.manufacturerName || "",
      });
    }
  }, []);

  function setValue(check: string, value: string) {
    setAnswers((prev) => ({ ...prev, [check]: { ...prev[check], value: prev[check].value === value ? "" : value } }));
  }
  function setRemark(check: string, remark: string) {
    setAnswers((prev) => ({ ...prev, [check]: { ...prev[check], remark } }));
  }
  function setAll(value: string) {
    setAnswers((prev) => {
      const next: Record<string, Answer> = {};
      QC_CHECKS.forEach((c) => { next[c] = { ...prev[c], value }; });
      return next;
    });
  }

  const result = deriveResult(QC_CHECKS.map((c) => answers[c].value));
  const rs = RESULT_STYLE[result];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!stockNo.trim()) return setError("Please pick a Stock No.");
    setSubmitting(true);
    const items: Record<string, Answer> = {};
    QC_CHECKS.forEach((c) => { items[c] = answers[c]; });
    const res = await fetch("/api/qc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stockNo, ...detail, date: isoToDdmmyyyy(date), checkedBy, comments, items }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Failed to save QC.");
      return;
    }
    const d = await res.json();
    setDone(d.result || result);
    router.refresh();
  }

  if (done !== null) {
    const ds = RESULT_STYLE[done] || RESULT_STYLE.PENDING;
    return (
      <div className="card" style={{ borderColor: "#16a34a", background: "#f0fdf4" }}>
        <h2 style={{ marginTop: 0 }}>✅ QC saved</h2>
        <p>
          Stock <b>{stockNo}</b> — result{" "}
          <span className="badge" style={{ background: ds.bg }}>{ds.label}</span>
        </p>
        <div className="row" style={{ marginTop: 8 }}>
          <Link className="btn gold" href="/qc">View QC list</Link>
          {!editing && (
            <button className="btn ghost" type="button" onClick={() => {
              setDone(null); setStockNo(""); setDetail(EMPTY_DETAIL); setComments("");
              const cleared: Record<string, Answer> = {}; QC_CHECKS.forEach((c) => { cleared[c] = { value: "", remark: "" }; });
              setAnswers(cleared);
            }}>QC another</button>
          )}
        </div>
      </div>
    );
  }

  const stockItems = stocks.map((s) => ({
    value: s.stockNo,
    label: [s.stockNo, s.designName, s.goldDetails].filter(Boolean).join("  ·  "),
  }));

  const detailRows: [string, string][] = [
    ["Design Name", detail.designName], ["Design Number", detail.designNumber],
    ["Gold Details", detail.goldDetails], ["Location", detail.location],
    ["Inch Size", detail.inchSize], ["Gross Weight", detail.grossWeight],
    ["Net Weight", detail.netWeight], ["Total Diamond Wt", detail.totalDiamondWeight],
    ["Total Dia Pcs", detail.totalDiaPcs], ["Manufacturer", detail.manufacturerName],
  ];

  return (
    <form onSubmit={submit}>
      {error && (
        <div className="card" style={{ borderColor: "#dc2626", color: "#dc2626", background: "#fef2f2" }}>{error}</div>
      )}

      <div className="card">
        <h2>Piece</h2>
        <div className="grid3">
          <div className="field">
            <label>Stock No. <span className="req">*</span></label>
            {editing ? (
              <input value={stockNo} readOnly style={{ background: "#f8fafc" }} />
            ) : (
              <OptionInput value={stockNo} onChange={(v) => pickStock(v, stocks)} options={[]} items={stockItems} placeholder="Pick a stock number" />
            )}
            <span className="muted" style={{ fontSize: 12, marginTop: 4 }}>All details auto-fetch from the stock.</span>
          </div>
          <div className="field">
            <label>QC Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Checked By</label>
            <input value={checkedBy} onChange={(e) => setCheckedBy(e.target.value)} placeholder="QC person" />
          </div>
        </div>
        {stockNo && (
          <div className="grid3" style={{ marginTop: 8 }}>
            {detailRows.map(([k, v]) => (
              <div key={k} style={{ fontSize: 13 }}>
                <span className="muted">{k}: </span>
                <b>{v || "—"}</b>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <div className="row spread">
          <div>
            <h2 style={{ margin: 0 }}>Quality Checks</h2>
            <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>Mark Yes/No for each, add a remark where needed.</p>
          </div>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <span className="badge" style={{ background: rs.bg }}>{rs.label}</span>
            <button type="button" className="btn ghost small" onClick={() => setAll("YES")}>All Yes</button>
            <button type="button" className="btn ghost small" onClick={() => setAll("")}>Clear</button>
          </div>
        </div>
        <table style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Check</th>
              <th style={{ width: 150 }}>Result</th>
              <th>Remark</th>
            </tr>
          </thead>
          <tbody>
            {QC_CHECKS.map((c) => {
              const a = answers[c];
              return (
                <tr key={c}>
                  <td>{c}</td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => setValue(c, "YES")}
                        style={a.value === "YES"
                          ? { background: "#16a34a", color: "#fff", border: "1px solid #16a34a" }
                          : { background: "#fff", color: "#1c1917", border: "1px solid #d6d3d1" }}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => setValue(c, "NO")}
                        style={a.value === "NO"
                          ? { background: "#dc2626", color: "#fff", border: "1px solid #dc2626" }
                          : { background: "#fff", color: "#1c1917", border: "1px solid #d6d3d1" }}
                      >
                        No
                      </button>
                    </div>
                  </td>
                  <td>
                    <input value={a.remark} onChange={(e) => setRemark(c, e.target.value)} placeholder="Remark" style={{ width: "100%", minWidth: 180 }} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="field">
          <label>Comments</label>
          <textarea rows={3} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Overall QC remarks" />
        </div>
      </div>

      <div className="row">
        <button className="btn gold" type="submit" disabled={submitting}>{submitting ? "Saving…" : editing ? "Update QC" : "Save QC"}</button>
        <button type="button" className="btn ghost" onClick={() => router.push("/qc")}>Cancel</button>
      </div>
    </form>
  );
}

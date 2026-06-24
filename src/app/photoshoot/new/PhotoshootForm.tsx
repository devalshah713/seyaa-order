"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import OptionInput from "@/app/stock/new/OptionInput";

type StockLite = { stockNo: string; designName: string; goldColor: string; designNumber: string };
export type PhotoshootInitial = {
  stockNo: string;
  designName: string;
  goldColor: string;
  date: string; // dd/mm/yyyy
  rawImages: string;
  promptA: string;
  promptB: string;
  promptC: string;
  promptD: string;
  video: string;
  instagramPost: string;
  instagramReel: string;
  instagramStory: string;
  comments: string;
};

function isoToDdmmyyyy(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
function ddmmyyyyToIso(s: string): string {
  const m = (s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

// A labelled URL input.
function LinkField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="row" style={{ gap: 6 }}>
        <input type="url" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Paste Google Drive / JioCloud link" />
        {value ? (
          <a href={value} target="_blank" rel="noreferrer" className="btn ghost small" style={{ alignSelf: "center" }}>Open</a>
        ) : null}
      </div>
    </div>
  );
}

export default function PhotoshootForm({ initial = null }: { initial?: PhotoshootInitial | null }) {
  const router = useRouter();
  const editing = !!initial;

  const [stocks, setStocks] = useState<StockLite[]>([]);
  const [stockNo, setStockNo] = useState(initial?.stockNo || "");
  const [designName, setDesignName] = useState(initial?.designName || "");
  const [goldColor, setGoldColor] = useState(initial?.goldColor || "");

  const todayIso = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(initial ? (ddmmyyyyToIso(initial.date) || todayIso) : todayIso);

  const [rawImages, setRawImages] = useState(initial?.rawImages || "");
  const [promptA, setPromptA] = useState(initial?.promptA || "");
  const [promptB, setPromptB] = useState(initial?.promptB || "");
  const [promptC, setPromptC] = useState(initial?.promptC || "");
  const [promptD, setPromptD] = useState(initial?.promptD || "");
  const [video, setVideo] = useState(initial?.video || "");
  const [instagramPost, setInstagramPost] = useState(initial?.instagramPost || "");
  const [instagramReel, setInstagramReel] = useState(initial?.instagramReel || "");
  const [instagramStory, setInstagramStory] = useState(initial?.instagramStory || "");
  const [comments, setComments] = useState(initial?.comments || "");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch("/api/stock").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (Array.isArray(d?.stocks)) setStocks(d.stocks);
    }).catch(() => {});
  }, []);

  // Auto-fetch design name + gold color from the chosen Stock No.
  const pickStock = useCallback((no: string, list: StockLite[]) => {
    setStockNo(no);
    const s = list.find((x) => x.stockNo === no);
    if (s) {
      setDesignName(s.designName || "");
      setGoldColor(s.goldColor || "");
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!stockNo.trim()) return setError("Please pick a Stock No.");
    setSubmitting(true);
    const res = await fetch("/api/photoshoot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stockNo, designName, goldColor, date: isoToDdmmyyyy(date),
        rawImages, promptA, promptB, promptC, promptD, video,
        instagramPost, instagramReel, instagramStory, comments,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Failed to save photoshoot.");
      return;
    }
    setDone(true);
    router.refresh();
  }

  if (done) {
    return (
      <div className="card" style={{ borderColor: "#16a34a", background: "#f0fdf4" }}>
        <h2 style={{ marginTop: 0 }}>✅ Photoshoot saved</h2>
        <p>Saved for <b>Stock No. {stockNo}</b>{designName ? <> · {designName}</> : null}.</p>
        <div className="row" style={{ marginTop: 8 }}>
          <Link className="btn gold" href="/photoshoot">View photoshoots</Link>
          {!editing && (
            <button className="btn ghost" type="button" onClick={() => {
              setDone(false); setStockNo(""); setDesignName(""); setGoldColor("");
              setRawImages(""); setPromptA(""); setPromptB(""); setPromptC(""); setPromptD(""); setVideo("");
              setInstagramPost(""); setInstagramReel(""); setInstagramStory(""); setComments("");
            }}>Record another</button>
          )}
        </div>
      </div>
    );
  }

  const stockItems = stocks.map((s) => ({
    value: s.stockNo,
    label: [s.stockNo, s.designName, s.goldColor].filter(Boolean).join("  ·  "),
  }));

  return (
    <form onSubmit={submit}>
      {error && (
        <div className="card" style={{ borderColor: "#dc2626", color: "#dc2626", background: "#fef2f2" }}>{error}</div>
      )}

      <div className="card">
        <h2>Product</h2>
        <div className="grid3">
          <div className="field">
            <label>Stock No. <span className="req">*</span></label>
            {editing ? (
              <input value={stockNo} readOnly style={{ background: "#f8fafc" }} />
            ) : (
              <OptionInput value={stockNo} onChange={(v) => pickStock(v, stocks)} options={[]} items={stockItems} placeholder="Pick a stock number" />
            )}
            <span className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {editing ? "Editing this stock's photoshoot." : "Design Name & Gold Color auto-fill from the stock."}
            </span>
          </div>
          <div className="field">
            <label>Design Name</label>
            <input value={designName} onChange={(e) => setDesignName(e.target.value)} placeholder="auto-filled" />
          </div>
          <div className="field">
            <label>Gold Color</label>
            <input value={goldColor} onChange={(e) => setGoldColor(e.target.value)} placeholder="auto-filled" />
          </div>
          <div className="field">
            <label>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card">
        <h2>AI Photoshoot</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>Paste the links from Google Drive / JioCloud.</p>
        <div className="grid2">
          <LinkField label="Raw Images" value={rawImages} onChange={setRawImages} />
          <LinkField label="Video" value={video} onChange={setVideo} />
          <LinkField label="Prompt A Image" value={promptA} onChange={setPromptA} />
          <LinkField label="Prompt B Image" value={promptB} onChange={setPromptB} />
          <LinkField label="Prompt C Image" value={promptC} onChange={setPromptC} />
          <LinkField label="Prompt D Image" value={promptD} onChange={setPromptD} />
        </div>
      </div>

      <div className="card">
        <h2>Digital Marketing</h2>
        <div className="grid3">
          <LinkField label="Instagram Post" value={instagramPost} onChange={setInstagramPost} />
          <LinkField label="Instagram Reel" value={instagramReel} onChange={setInstagramReel} />
          <LinkField label="Instagram Story" value={instagramStory} onChange={setInstagramStory} />
        </div>
      </div>

      <div className="card">
        <div className="field">
          <label>Comments</label>
          <textarea rows={3} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Any notes about the photoshoot / marketing" />
        </div>
      </div>

      <div className="row">
        <button className="btn gold" type="submit" disabled={submitting}>{submitting ? "Saving…" : editing ? "Update Photoshoot" : "Save Photoshoot"}</button>
        <button type="button" className="btn ghost" onClick={() => router.push("/photoshoot")}>Cancel</button>
      </div>
    </form>
  );
}

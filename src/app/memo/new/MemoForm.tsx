"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MemoSheet from "@/components/MemoSheet";
import {
  JEWELLERY_TYPES,
  PURPOSES,
  parseCodes,
  todayInput,
} from "@/lib/memoFormat";

type Item = { key: number; type: string; stock: string };

export type MemoInitial = {
  id: string;
  memoNo: string;
  to: string;
  through: string;
  mobile: string;
  date: string;
  purpose: string;
  comment: string;
  items: { type: string; stockNos: string[] }[];
};

let keySeq = 1;
const newItem = (type = "", stock = ""): Item => ({ key: keySeq++, type, stock });

export default function MemoForm({ initial }: { initial?: MemoInitial }) {
  const router = useRouter();
  const editing = !!initial;

  const [to, setTo] = useState(initial?.to ?? "");
  const [through, setThrough] = useState(initial?.through ?? "");
  const [mobile, setMobile] = useState(initial?.mobile ?? "");
  const [date, setDate] = useState(initial?.date || todayInput());
  const [purpose, setPurpose] = useState<string>(initial?.purpose ?? PURPOSES[0]);
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [items, setItems] = useState<Item[]>(
    initial
      ? initial.items.map((it) => newItem(it.type, it.stockNos.join(", ")))
      : [newItem("Ring"), newItem("Pendant"), newItem()]
  );
  const [memoNo, setMemoNo] = useState(initial?.memoNo ?? "SS/…");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Create mode only: fetch the predicted next memo number when the date changes.
  // In edit mode the memo keeps its original number.
  const latest = useRef(0);
  useEffect(() => {
    if (editing) return;
    const id = ++latest.current;
    fetch(`/api/memos/next?date=${encodeURIComponent(date)}`)
      .then((r) => r.json())
      .then((d) => { if (id === latest.current && d.memoNo) setMemoNo(d.memoNo); })
      .catch(() => {});
  }, [date, editing]);

  const sheetItems = useMemo(
    () => items.map((it) => ({ type: it.type, stockNos: parseCodes(it.stock) })),
    [items]
  );

  function setItem(key: number, patch: Partial<Item>) {
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }
  function removeItem(key: number) {
    setItems((list) => {
      const next = list.filter((it) => it.key !== key);
      return next.length ? next : [newItem()];
    });
  }

  async function save() {
    setError("");
    const payload = {
      to, through, mobile, date, purpose, comment,
      items: sheetItems.filter((it) => it.type || it.stockNos.length),
    };
    if (!payload.items.length) {
      setError("Add at least one item (type or stock number) before saving.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/memos/${initial!.id}` : "/api/memos", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the memo.");
      router.push(`/memo/${data.memo.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the memo.");
      setSaving(false);
    }
  }

  return (
    <div className="app">
      <aside className="controls no-print">
        <fieldset className="group">
          <legend>Recipient</legend>
          <label className="field"><span>To</span>
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Recipient name / firm" /></label>
          <label className="field"><span>Through</span>
            <input value={through} onChange={(e) => setThrough(e.target.value)} placeholder="Broker / angadia / person" /></label>
          <label className="field"><span>Mobile Number</span>
            <input value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" placeholder="+91 " /></label>
        </fieldset>

        <fieldset className="group">
          <legend>Memo Details</legend>
          <div className="two">
            <label className="field"><span>Memo No.</span>
              <input value={memoNo} readOnly /></label>
            <label className="field"><span>Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          </div>
          <label className="field"><span>Purpose</span>
            <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
              {PURPOSES.map((p) => <option key={p}>{p}</option>)}
            </select></label>
          <label className="field"><span>Comment</span>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional note…" /></label>
        </fieldset>

        <fieldset className="group">
          <legend>Jewellery Items</legend>
          <p className="group-hint">One card per Type. Enter all its stock numbers separated by commas.</p>
          {items.map((it, i) => {
            const qty = parseCodes(it.stock).length;
            return (
              <div className="item-card" key={it.key}>
                <div className="ic-head">
                  <span className="sr">{i + 1}</span>
                  <select className="type" value={it.type} onChange={(e) => setItem(it.key, { type: e.target.value })}>
                    <option value="">— Type —</option>
                    {JEWELLERY_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                  <span className="qty-badge">{qty} {qty === 1 ? "pc" : "pcs"}</span>
                  <button className="del" onClick={() => removeItem(it.key)} title="Remove" aria-label="Remove item type">×</button>
                </div>
                <textarea className="stock" spellCheck={false} value={it.stock}
                  onChange={(e) => setItem(it.key, { stock: e.target.value })}
                  placeholder="SS1024, SS1025, SS1026 …" />
                <p className="hint">Comma-separated · each up to 6 letters/numbers</p>
              </div>
            );
          })}
          <button className="ghost" onClick={() => setItems((l) => [...l, newItem()])}>+ Add item type</button>
        </fieldset>

        <div className="actions">
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : editing ? "Update Memo" : "Save Memo"}
          </button>
        </div>
        {error && <p className="save-error">{error}</p>}
      </aside>

      <main className="stage">
        <MemoSheet data={{ memoNo, to, through, mobile, date, purpose, comment, items: sheetItems }} />
      </main>
    </div>
  );
}

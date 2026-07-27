"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MemoSheet from "@/components/MemoSheet";
import {
  GOLD_FORMS,
  GOLD_PURPOSES,
  JEWELLERY_TYPES,
  PURPOSES,
  fineWeight,
  fmtWeight,
  normalizeTouch,
  parseCodes,
  parseWeight,
  todayInput,
  type MemoKind,
} from "@/lib/memoFormat";

type Item = { key: number; type: string; stock: string };
// Gold weights stay as raw strings while typing so a half-entered "91." does
// not get rewritten under the cursor; they are parsed on save and for preview.
type GoldRow = { key: number; description: string; touch: string; gross: string };

export type MemoInitial = {
  id: string;
  memoNo: string;
  kind?: MemoKind;
  to: string;
  through: string;
  mobile: string;
  date: string;
  purpose: string;
  comment: string;
  items: { type: string; stockNos: string[] }[];
  goldItems?: { description: string; touch: number; grossWt: number }[];
  againstMemoNo?: string;
};

let keySeq = 1;
const newItem = (type = "", stock = ""): Item => ({ key: keySeq++, type, stock });
const newGold = (description = "", touch = "", gross = ""): GoldRow => ({
  key: keySeq++, description, touch, gross,
});

export default function MemoForm({
  initial,
  kind = "jewellery",
}: {
  initial?: MemoInitial;
  kind?: MemoKind;
}) {
  const router = useRouter();
  const editing = !!initial;
  const memoKind: MemoKind = initial?.kind ?? kind;
  const gold = memoKind === "gold";
  const purposeList = gold ? GOLD_PURPOSES : PURPOSES;

  const [to, setTo] = useState(initial?.to ?? "");
  const [through, setThrough] = useState(initial?.through ?? "");
  const [mobile, setMobile] = useState(initial?.mobile ?? "");
  const [date, setDate] = useState(initial?.date || todayInput());
  const [purpose, setPurpose] = useState<string>(initial?.purpose ?? purposeList[0]);
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [againstMemoNo, setAgainstMemoNo] = useState(initial?.againstMemoNo ?? "");
  const [issues, setIssues] = useState<{ memoNo: string; to: string; date: string }[]>([]);
  const [items, setItems] = useState<Item[]>(
    initial && !gold
      ? initial.items.map((it) => newItem(it.type, it.stockNos.join(", ")))
      : [newItem("Ring"), newItem("Pendant"), newItem()]
  );
  const [goldRows, setGoldRows] = useState<GoldRow[]>(
    initial?.goldItems?.length
      ? initial.goldItems.map((r) => newGold(r.description, r.touch ? String(r.touch) : "", r.grossWt ? String(r.grossWt) : ""))
      : [newGold("Fine Gold Bar", "99.50"), newGold()]
  );
  const [memoNo, setMemoNo] = useState(initial?.memoNo ?? (gold ? "SG/…" : "SS/…"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isReceipt = gold && /receipt/i.test(purpose);

  // Create mode only: fetch the predicted next memo number when the date
  // changes. In edit mode the memo keeps its original number.
  const latest = useRef(0);
  useEffect(() => {
    if (editing) return;
    const id = ++latest.current;
    fetch(`/api/memos/next?date=${encodeURIComponent(date)}&kind=${memoKind}`)
      .then((r) => r.json())
      .then((d) => { if (id === latest.current && d.memoNo) setMemoNo(d.memoNo); })
      .catch(() => {});
  }, [date, editing, memoKind]);

  // A Receipt is booked against an earlier Issue, so offer the list of them.
  useEffect(() => {
    if (!isReceipt) return;
    fetch("/api/memos/issues")
      .then((r) => r.json())
      .then((d) => setIssues(d.issues || []))
      .catch(() => {});
  }, [isReceipt]);

  const sheetItems = useMemo(
    () => items.map((it) => ({ type: it.type, stockNos: parseCodes(it.stock) })),
    [items]
  );

  const sheetGold = useMemo(
    () => goldRows.map((r) => ({
      description: r.description,
      touch: normalizeTouch(r.touch),
      grossWt: parseWeight(r.gross),
      fineWt: fineWeight(r.gross, r.touch),
    })),
    [goldRows]
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
  function setGoldRow(key: number, patch: Partial<GoldRow>) {
    setGoldRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function removeGoldRow(key: number) {
    setGoldRows((list) => {
      const next = list.filter((r) => r.key !== key);
      return next.length ? next : [newGold()];
    });
  }

  async function save() {
    setError("");
    const goldPayload = sheetGold.filter((r) => r.description || r.grossWt > 0);
    const itemsPayload = sheetItems.filter((it) => it.type || it.stockNos.length);

    if (gold) {
      if (!goldPayload.length) {
        setError("Add at least one gold row (description or weight) before saving.");
        return;
      }
      const bad = goldPayload.find((r) => !(r.grossWt > 0) || !(r.touch > 0));
      if (bad) {
        setError(`Every gold row needs a gross weight and a touch. Check "${bad.description || "the blank row"}".`);
        return;
      }
    } else if (!itemsPayload.length) {
      setError("Add at least one item (type or stock number) before saving.");
      return;
    }

    const payload = {
      kind: memoKind,
      to, through, mobile, date, purpose, comment,
      items: gold ? [] : itemsPayload,
      goldItems: gold ? goldPayload : [],
      againstMemoNo: isReceipt ? againstMemoNo : "",
    };

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

  const totalGross = sheetGold.reduce((n, r) => n + r.grossWt, 0);
  const totalFine = sheetGold.reduce((n, r) => n + r.fineWt, 0);

  return (
    <div className="app">
      <aside className="controls no-print">
        <fieldset className="group">
          <legend>{gold ? "Factory" : "Recipient"}</legend>
          <label className="field"><span>{gold ? "Factory / Karigar" : "To"}</span>
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder={gold ? "Factory name / karigar" : "Recipient name / firm"} /></label>
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
              {purposeList.map((p) => <option key={p}>{p}</option>)}
            </select></label>
          {isReceipt && (
            <label className="field"><span>Against Issue Memo</span>
              <select value={againstMemoNo} onChange={(e) => setAgainstMemoNo(e.target.value)}>
                <option value="">— None —</option>
                {issues.map((iss) => (
                  <option key={iss.memoNo} value={iss.memoNo}>{iss.memoNo} · {iss.to}</option>
                ))}
              </select></label>
          )}
          <label className="field"><span>Comment</span>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional note…" /></label>
        </fieldset>

        {gold ? (
          <fieldset className="group">
            <legend>Gold</legend>
            <p className="group-hint">One row per lot. Fine weight is worked out for you as gross × touch.</p>
            {goldRows.map((r, i) => {
              const fine = fineWeight(r.gross, r.touch);
              return (
                <div className="item-card" key={r.key}>
                  <div className="ic-head">
                    <span className="sr">{i + 1}</span>
                    <input className="type" list="gold-forms" value={r.description}
                      onChange={(e) => setGoldRow(r.key, { description: e.target.value })}
                      placeholder="Description" />
                    <span className="qty-badge">{fine > 0 ? `${fmtWeight(fine)} g fine` : "—"}</span>
                    <button className="del" onClick={() => removeGoldRow(r.key)} title="Remove" aria-label="Remove gold row">×</button>
                  </div>
                  <div className="two">
                    <label className="field"><span>Gross Wt (g)</span>
                      <input value={r.gross} inputMode="decimal" placeholder="0.000"
                        onChange={(e) => setGoldRow(r.key, { gross: e.target.value })} /></label>
                    <label className="field"><span>Touch</span>
                      <input value={r.touch} inputMode="decimal" placeholder="91.60"
                        onChange={(e) => setGoldRow(r.key, { touch: e.target.value })} /></label>
                  </div>
                  <p className="hint">Touch as 91.60 or 916 — both are understood.</p>
                </div>
              );
            })}
            <datalist id="gold-forms">
              {GOLD_FORMS.map((f) => <option key={f} value={f} />)}
            </datalist>
            <button className="ghost" onClick={() => setGoldRows((l) => [...l, newGold()])}>+ Add gold row</button>
            <p className="group-total">
              Total <strong>{fmtWeight(Math.round(totalGross * 1000) / 1000) || "0.000"} g</strong> gross ·{" "}
              <strong>{fmtWeight(Math.round(totalFine * 1000) / 1000) || "0.000"} g</strong> fine
            </p>
          </fieldset>
        ) : (
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
        )}

        <div className="actions">
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : editing ? "Update Memo" : "Save Memo"}
          </button>
        </div>
        {error && <p className="save-error">{error}</p>}
      </aside>

      <main className="stage">
        <MemoSheet data={{
          memoNo, kind: memoKind, to, through, mobile, date, purpose, comment,
          items: sheetItems, goldItems: sheetGold,
          againstMemoNo: isReceipt ? againstMemoNo : "",
        }} />
      </main>
    </div>
  );
}

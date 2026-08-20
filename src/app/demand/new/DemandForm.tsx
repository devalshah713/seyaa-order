"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DemandSheetView from "@/components/DemandSheetView";
import Combo from "@/components/Combo";
import { todayInput } from "@/lib/memoFormat";
import { DIA_SHAPES } from "@/lib/pdConfig";
import {
  BLANK_DEMAND_ROW, GROWTH_TYPES, type DemandRow,
} from "@/lib/demandConfig";

export type DemandInitial = {
  id: string;
  demandNo: string;
  date: string;
  issuedTo: string;
  notes: string;
  rows: DemandRow[];
  pdId?: string;
  pdNo?: string;
};

export default function DemandForm({ initial }: { initial?: DemandInitial }) {
  const router = useRouter();
  // Seeding from a PD sheet also passes `initial`, but with no id — that is
  // still a new demand. Only a real id means we are editing a saved one.
  const editing = !!initial?.id;

  const [date, setDate] = useState(initial?.date || todayInput());
  const [issuedTo, setIssuedTo] = useState(initial?.issuedTo ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [rows, setRows] = useState<DemandRow[]>(
    initial?.rows?.length ? initial.rows : [{ ...BLANK_DEMAND_ROW }]
  );
  const [demandNo, setDemandNo] = useState(initial?.demandNo || "");
  const [numbering, setNumbering] = useState<"loading" | "ok" | "failed">(
    editing ? "ok" : "loading"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");


  // The next demand number, previewed for the fiscal year the date falls in.
  // A saved demand keeps the number it was given, so this only runs for new
  // ones. The lookup retries rather than failing silently — a stuck "DD/…"
  // looks like the numbering is broken when it isn't.
  const latest = useRef(0);
  useEffect(() => {
    if (editing) return;
    const n = ++latest.current;
    let cancelled = false;
    setNumbering("loading");

    async function load(attempt = 0): Promise<void> {
      try {
        const res = await fetch(`/api/demand?next=${encodeURIComponent(date)}`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.demandNo) throw new Error("no number");
        if (cancelled || n !== latest.current) return;
        setDemandNo(data.demandNo);
        setNumbering("ok");
      } catch {
        if (cancelled || n !== latest.current) return;
        if (attempt < 2) {
          setTimeout(() => void load(attempt + 1), 600 * (attempt + 1));
          return;
        }
        // Not fatal: the number is assigned by the server on save either way.
        setNumbering("failed");
      }
    }
    void load();

    return () => { cancelled = true; };
  }, [date, editing]);

  const setRow = (i: number, patch: Partial<DemandRow>) =>
    setRows((list) => list.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  const addRow = () =>
    setRows((list) => [
      ...list,
      // Carry the design number down — a demand usually lists sizes for the
      // same design, so retyping it every row is wasted effort.
      { ...BLANK_DEMAND_ROW, designNo: list[list.length - 1]?.designNo || "" },
    ]);

  const removeRow = (i: number) =>
    setRows((list) => {
      const next = list.filter((_, n) => n !== i);
      return next.length ? next : [{ ...BLANK_DEMAND_ROW }];
    });

  async function save() {
    setError("");
    const payload = {
      date, issuedTo, notes,
      rows: rows.filter((r) => r.designNo || r.shape || r.pointers || r.pcs || r.bags),
      pdId: initial?.pdId, pdNo: initial?.pdNo,
    };
    if (!payload.rows.length) {
      setError("Add at least one diamond row before saving.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/demand/${initial!.id}` : "/api/demand", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      // Not every failure comes back as JSON — an empty body would otherwise
      // surface as a parser error instead of something readable.
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || `Could not save the demand (${res.status}).`);
      }
      if (!data?.demand?.id) throw new Error("Saved, but the demand came back empty.");
      router.push(`/demand/${data.demand.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the demand.");
      setSaving(false);
    }
  }

  return (
    <div className="app">
      <aside className="controls no-print">
        <fieldset className="group">
          <legend>Demand</legend>
          <div className="two">
            <label className="field"><span>Demand No.</span>
              <input
                value={
                  demandNo ||
                  (numbering === "loading" ? "Generating…" : "Assigned on save")
                }
                readOnly
              />
            </label>
            <label className="field"><span>Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          </div>
          {!editing && (
            <p className="group-hint">
              Generated automatically. The final number is assigned when you save.
            </p>
          )}
          <label className="field"><span>Issued to</span>
            <input value={issuedTo} onChange={(e) => setIssuedTo(e.target.value)}
              placeholder="Diamond department / supplier" /></label>
          {initial?.pdNo && (
            <p className="group-hint">Raised from PD sheet <b>{initial.pdNo}</b>.</p>
          )}
        </fieldset>

        <fieldset className="group">
          <legend>Diamonds</legend>
          {rows.map((r, i) => (
            <div className="dd-row" key={i}>
              <div className="dd-rowhead">
                <span className="sr">{i + 1}</span>
                <input
                  className="design"
                  value={r.designNo}
                  onChange={(e) => setRow(i, { designNo: e.target.value })}
                  placeholder="Design No"
                />
                <button type="button" className="del" onClick={() => removeRow(i)}
                  title="Remove row" aria-label="Remove row">×</button>
              </div>
              <div className="three">
                <label className="field"><span>Shape</span>
                  <Combo value={r.shape} onChange={(v) => setRow(i, { shape: v })}
                    options={DIA_SHAPES} placeholder="Pear" /></label>
                <label className="field"><span>Pointers</span>
                  <input value={r.pointers} onChange={(e) => setRow(i, { pointers: e.target.value })}
                    placeholder="1CT" /></label>
                <label className="field"><span>CVD/HPHT</span>
                  <Combo value={r.growth} onChange={(v) => setRow(i, { growth: v })}
                    options={GROWTH_TYPES} placeholder="CVD" /></label>
              </div>
              <div className="three">
                <label className="field"><span>No. of Pcs</span>
                  <input value={r.pcs} inputMode="numeric"
                    onChange={(e) => setRow(i, { pcs: e.target.value })} /></label>
                <label className="field"><span>Bags</span>
                  <input value={r.bags} inputMode="numeric"
                    onChange={(e) => setRow(i, { bags: e.target.value })} /></label>
                <label className="field"><span>Comments</span>
                  <input value={r.comments}
                    onChange={(e) => setRow(i, { comments: e.target.value })} /></label>
              </div>
            </div>
          ))}
          <button type="button" className="ghost" onClick={addRow}>+ Add diamond row</button>
        </fieldset>

        <fieldset className="group">
          <legend>Notes</legend>
          <label className="field"><span>Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        </fieldset>

        <div className="actions">
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : editing ? "Update Demand" : "Save Demand"}
          </button>
        </div>
        {error && <p className="save-error">{error}</p>}
      </aside>

      <main className="stage">
        <DemandSheetView
          data={{ demandNo, date, issuedTo, notes, rows, pdNo: initial?.pdNo }}
        />
      </main>
    </div>
  );
}

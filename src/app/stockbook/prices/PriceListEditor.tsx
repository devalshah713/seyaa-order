"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ByKarat, FancyPrice, PriceList, RoundPrice } from "@/lib/priceList";

// The price list, editable in the portal.
//
// Nothing is stamped onto a stock entry, so saving here re-values every piece
// in the book at once — which is the whole point of keeping it here rather than
// in a spreadsheet somebody has to remember to circulate.

type Table = "round" | "fancy";
type RateKey = "gold" | "labour" | "polkiLabour";

const RATE_ROWS: { key: RateKey; label: string }[] = [
  { key: "gold", label: "Gold, per gram" },
  { key: "labour", label: "Labour, per gram" },
  { key: "polkiLabour", label: "Polki labour, per gram" },
];

const numText = (n: number | null) => (n === null ? "" : String(n));

function rateTextOf(p: PriceList): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key } of RATE_ROWS) {
    for (const karat of ["k14", "k18"] as (keyof ByKarat)[]) {
      for (const cur of ["usd", "inr"] as const) {
        out[`${key}.${karat}.${cur}`] = String(p.rates[key][karat][cur]);
      }
    }
  }
  return out;
}

export default function PriceListEditor({ prices }: { prices: PriceList }) {
  const router = useRouter();
  const [list, setList] = useState<PriceList>(prices);
  // Rates are held as text while they are being typed, so a box can be emptied
  // and retyped. What is unreadable when saving keeps the figure it had — a
  // blank gold price would quietly value every piece at its diamonds alone.
  const [rateText, setRateText] = useState<Record<string, string>>(() =>
    rateTextOf(prices)
  );
  const [table, setTable] = useState<Table>("round");
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const touch = () => { setNote(""); setError(""); };

  function setRate(key: RateKey, karat: keyof ByKarat, cur: "usd" | "inr", raw: string) {
    touch();
    setRateText((t) => ({ ...t, [`${key}.${karat}.${cur}`]: raw }));
  }

  // The rates as they will be saved: every box that reads as a number, and the
  // old figure wherever one does not.
  const rates = useMemo(() => {
    const out = structuredClone(list.rates);
    for (const { key } of RATE_ROWS) {
      for (const karat of ["k14", "k18"] as (keyof ByKarat)[]) {
        for (const cur of ["usd", "inr"] as const) {
          const n = Number(rateText[`${key}.${karat}.${cur}`]);
          if (rateText[`${key}.${karat}.${cur}`]?.trim() && Number.isFinite(n)) {
            out[key][karat][cur] = n;
          }
        }
      }
    }
    return out;
  }, [list.rates, rateText]);

  function setCell(kind: Table, i: number, field: string, raw: string) {
    touch();
    setList((l) => {
      const rows = [...l[kind]];
      const money = field === "usd" || field === "inr";
      const value = money
        ? (raw.trim() === "" ? null : Number(raw))
        : raw;
      if (money && value !== null && !Number.isFinite(value as number)) return l;
      rows[i] = { ...rows[i], [field]: value } as RoundPrice & FancyPrice;
      return { ...l, [kind]: rows };
    });
  }

  function addRow(kind: Table) {
    touch();
    setList((l) => ({
      ...l,
      [kind]: kind === "round"
        ? [...l.round, { code: "", sieve: "", mm: "", pointers: "", usd: null, inr: null }]
        : [...l.fancy, { code: "", shape: "", pointers: "", mm: "", usd: null, inr: null }],
    }));
  }

  function dropRow(kind: Table, i: number) {
    touch();
    setList((l) => ({ ...l, [kind]: l[kind].filter((_, n) => n !== i) }));
  }

  // Filtering is a view of the table, so the index written back is the real one.
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = list[table] as (RoundPrice & FancyPrice)[];
    return rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) =>
        !needle ||
        [r.code, r.sieve, r.shape, r.mm, r.pointers].join(" ").toLowerCase().includes(needle)
      );
  }, [list, table, q]);

  async function save() {
    setError("");
    setNote("");
    setSaving(true);
    try {
      const res = await fetch("/api/prices", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prices: { ...list, rates } }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Could not save (${res.status}).`);
      setList(data.prices);
      setRateText(rateTextOf(data.prices));
      setNote("Saved. Everything in the book is priced at these rates from now on.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the price list.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="sb-rates">
        <h2>Rates</h2>
        <div className="jg-scroll">
          <table className="jg-table sb-table">
            <thead>
              <tr>
                <th />
                <th>14KT ($)</th><th>14KT (₹)</th>
                <th>18KT ($)</th><th>18KT (₹)</th>
              </tr>
            </thead>
            <tbody>
              {RATE_ROWS.map(({ key, label }) => (
                <tr key={key}>
                  <td data-label="Rate"><b>{label}</b></td>
                  {(["k14", "k18"] as (keyof ByKarat)[]).flatMap((karat) =>
                    (["usd", "inr"] as const).map((cur) => (
                      <td key={`${karat}-${cur}`} data-label={`${karat === "k14" ? "14KT" : "18KT"} ${cur === "usd" ? "$" : "₹"}`}>
                        <input
                          inputMode="decimal"
                          value={rateText[`${key}.${karat}.${cur}`] ?? ""}
                          onChange={(e) => setRate(key, karat, cur, e.target.value)}
                        />
                      </td>
                    ))
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="pieces-hint">
          Which one a piece is charged at comes from its Gold Details — anything
          reading 18K uses the 18KT column, everything else the 14KT one. Polki
          labour applies only to pieces ticked as polki.
        </p>
      </section>

      <div className="kind-tabs jg-tabs">
        <button className={table === "round" ? "active" : ""} onClick={() => setTable("round")}>
          Round ({list.round.length})
        </button>
        <button className={table === "fancy" ? "active" : ""} onClick={() => setTable("fancy")}>
          Fancy ({list.fancy.length})
        </button>
      </div>

      <div className="jg-bar">
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Product code, sieve, shape or size" />
        <button type="button" className="btn" onClick={() => addRow(table)}>+ Add a row</button>
      </div>

      {error && <p className="save-error" style={{ marginTop: 0 }}>{error}</p>}
      {note && <p className="pieces-ok">{note}</p>}

      <div className="jg-scroll">
        <table className="jg-table sb-table">
          <thead>
            <tr>
              <th className="jg-sr">#</th>
              <th>Product Code</th>
              <th>{table === "round" ? "Sieve" : "Shape"}</th>
              <th>{table === "round" ? "Size (mm)" : "Pointers"}</th>
              <th>{table === "round" ? "Pointers" : "Size (mm)"}</th>
              <th>Per carat ($)</th><th>Per carat (₹)</th>
              <th className="jg-sr" />
            </tr>
          </thead>
          <tbody>
            {visible.map(({ r, i }) => (
              <tr key={i}>
                <td className="jg-sr">{i + 1}</td>
                <td data-label="Product Code">
                  <input value={r.code} onChange={(e) => setCell(table, i, "code", e.target.value)} /></td>
                <td data-label={table === "round" ? "Sieve" : "Shape"}>
                  <input
                    value={table === "round" ? r.sieve : r.shape}
                    onChange={(e) => setCell(table, i, table === "round" ? "sieve" : "shape", e.target.value)} /></td>
                <td data-label={table === "round" ? "Size (mm)" : "Pointers"}>
                  <input
                    value={table === "round" ? r.mm : r.pointers}
                    onChange={(e) => setCell(table, i, table === "round" ? "mm" : "pointers", e.target.value)} /></td>
                <td data-label={table === "round" ? "Pointers" : "Size (mm)"}>
                  <input
                    value={table === "round" ? r.pointers : r.mm}
                    onChange={(e) => setCell(table, i, table === "round" ? "pointers" : "mm", e.target.value)} /></td>
                <td data-label="Per carat ($)">
                  <input inputMode="decimal" value={numText(r.usd)}
                    onChange={(e) => setCell(table, i, "usd", e.target.value)} /></td>
                <td data-label="Per carat (₹)">
                  <input inputMode="decimal" value={numText(r.inr)}
                    onChange={(e) => setCell(table, i, "inr", e.target.value)} /></td>
                <td className="jg-sr">
                  <button className="del" onClick={() => dropRow(table, i)}
                    title="Remove row" aria-label="Remove row">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pieces-actions">
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save the price list"}
        </button>
        <Link href="/stockbook" className="btn">Back to the book</Link>
      </div>
    </>
  );
}

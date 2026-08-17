"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/lib/memoFormat";
import { matchDesign } from "@/lib/designNo";
import { MIX, isMix, priceOf, type StockEntry } from "@/lib/stockBookConfig";
import { money, trim, type PriceList } from "@/lib/priceList";

// The stock book: what is in stock, and what it is worth today.
//
// Every figure here is worked out from the current price list rather than
// stamped onto the entry when it was made — so changing the gold rate re-values
// the whole book, exactly as the workbook does when its rate cell is edited.
export default function StockBookClient({
  entries,
  prices,
  initialQuery,
}: {
  entries: StockEntry[];
  prices: PriceList;
  initialQuery: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(entries);
  const [q, setQ] = useState(initialQuery);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState("");

  const locations = useMemo(() => {
    const seen = new Set<string>();
    for (const e of rows) if (e.location) seen.add(e.location);
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const shown = useMemo(() => {
    const needle = q.trim();
    const lower = needle.toLowerCase();
    return rows.filter((e) => {
      if (from && !(e.date && e.date >= from)) return false;
      if (to && !(e.date && e.date <= to)) return false;
      if (location && e.location !== location) return false;
      if (!needle) return true;
      // A design number names one piece, so it is matched the way the rest of
      // the portal matches one: a piece of a run finds the run it came from.
      if (e.designNo && matchDesign(e.designNo, needle)) return true;
      return [e.stockNo, e.design, e.category, e.subCategory, e.subSubCategory,
              e.location, e.goldDetails, e.partyName, e.comments,
              ...e.lines.map((l) => `${l.shape} ${l.sieve} ${l.code}`)]
        .join(" ").toLowerCase().includes(lower);
    });
  }, [rows, q, from, to, location]);

  const valued = useMemo(
    () => shown.map((e) => ({ e, p: priceOf(prices, e) })),
    [shown, prices]
  );

  const totals = useMemo(() => {
    let usd = 0, inr = 0, cts = 0, pcs = 0;
    for (const { p } of valued) {
      usd += p.total.usd; inr += p.total.inr;
      cts += p.totalWeight; pcs += p.totalPcs;
    }
    return { usd, inr, cts, pcs };
  }, [valued]);

  async function del(e: StockEntry) {
    if (!window.confirm(`Remove ${e.stockNo} — ${e.designNo || e.design} — from stock?`)) return;
    setError("");
    try {
      const res = await fetch(`/api/stockbook/${e.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Could not delete.");
      }
      setRows((list) => list.filter((x) => x.id !== e.id));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
    }
  }

  return (
    <>
      <div className="jg-bar">
        <input
          className="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Stock no., design number, category or product code"
        />
        <Link href="/stockbook/prices" className="btn">Price list</Link>
        <a href="/api/stockbook/export" className="btn">Export to Excel</a>
        <Link href="/stockbook/new" className="btn btn-primary">+ Take into Stock</Link>
      </div>

      <div className="jg-filters no-print">
        <label className="field"><span>From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="field"><span>To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="field"><span>Location</span>
          <select value={location} onChange={(e) => setLocation(e.target.value)}>
            <option value="">Everywhere</option>
            {locations.map((l) => <option key={l} value={l}>{l}</option>)}
          </select></label>
        {(from || to || location) && (
          <button type="button" className="linkbtn"
            onClick={() => { setFrom(""); setTo(""); setLocation(""); }}>
            Clear filters
          </button>
        )}
      </div>

      {error && <p className="save-error" style={{ marginTop: 0 }}>{error}</p>}

      {shown.length === 0 ? (
        <div className="empty-state">
          <p>
            {rows.length === 0
              ? "Nothing in stock yet. Take a finished piece in to start the book."
              : "No pieces match that."}
          </p>
          {rows.length === 0 && (
            <Link href="/stockbook/new" className="btn btn-primary">Take into Stock</Link>
          )}
        </div>
      ) : (
        <>
          <div className="jg-scroll">
            <table className="jg-table sb-table">
              <thead>
                <tr>
                  <th>Sr. No.</th><th>Date</th><th>Design</th><th>Design Number</th>
                  <th>Category</th><th>Location</th><th>Gold</th>
                  <th>Gross</th><th>Net</th>
                  <th>Dia Wt</th><th>Dia Pcs</th><th>Pointers</th>
                  <th>Shape</th><th>Sieve / Size</th><th>Code</th>
                  <th>Total ($)</th><th>Total (₹)</th>
                  <th className="jg-sr" />
                </tr>
              </thead>
              <tbody>
                {valued.map(({ e, p }) => {
                  const mix = isMix(e);
                  const one = e.lines[0];
                  return (
                    <tr key={e.id}>
                      <td data-label="Sr. No.">
                        <Link href={`/stockbook/${e.id}`} className="sb-link">{e.stockNo}</Link>
                      </td>
                      <td data-label="Date">{e.date ? formatDate(e.date) : "—"}</td>
                      <td data-label="Design" className="sb-wide">{e.design || "—"}</td>
                      <td data-label="Design Number">{e.designNo || "—"}</td>
                      <td data-label="Category">{e.category || "—"}</td>
                      <td data-label="Location">{e.location || "—"}</td>
                      <td data-label="Gold">{e.goldDetails || "—"}</td>
                      <td data-label="Gross" className="sb-num">{e.grossWt || "—"}</td>
                      <td data-label="Net" className="sb-num">{e.netWt || "—"}</td>
                      <td data-label="Dia Wt" className="sb-num">{trim(p.totalWeight, 3) || "—"}</td>
                      <td data-label="Dia Pcs" className="sb-num">{p.totalPcs || "—"}</td>
                      <td data-label="Pointers" className="sb-num">
                        {mix ? MIX : trim(p.pointer, 2) || "—"}</td>
                      <td data-label="Shape">{mix ? MIX : one?.shape || "—"}</td>
                      <td data-label="Sieve / Size">{mix ? MIX : one?.sieve || "—"}</td>
                      <td data-label="Code">{mix ? MIX : one?.code || "—"}</td>
                      <td data-label="Total ($)" className="sb-num">{money(p.total.usd)}</td>
                      <td data-label="Total (₹)" className="sb-num">{money(p.total.inr)}</td>
                      <td className="jg-sr">
                        <button className="del" onClick={() => del(e)}
                          title="Remove from stock" aria-label="Remove from stock">×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="jg-foot">
            <span>{shown.length} of {rows.length} pieces</span>
            <span>Diamonds <b>{trim(totals.cts, 3)}</b> cts</span>
            <span>Stones <b>{totals.pcs}</b></span>
            <span>Value <b>${money(totals.usd)}</b></span>
            <span>Value <b>₹{money(totals.inr)}</b></span>
          </div>
          <p className="pieces-hint">
            Priced at today&rsquo;s rates. Change the gold, labour or diamond
            prices on the <Link href="/stockbook/prices" className="linkbtn">price
            list</Link> and every figure here moves with them.
          </p>
        </>
      )}
    </>
  );
}

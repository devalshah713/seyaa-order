"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/lib/memoFormat";
import {
  MIX, isMix, priceOf, searchStock, type StockRow,
} from "@/lib/stockBookConfig";
import { money, trim, type PriceList } from "@/lib/priceList";

// The filters as the address bar writes them, so the page in hand and the page
// being asked for can be compared without the key order mattering.
function asQuery(f: { q: string; from: string; to: string; location: string }): string {
  const out = new URLSearchParams();
  if (f.q.trim()) out.set("q", f.q.trim());
  if (f.from) out.set("from", f.from);
  if (f.to) out.set("to", f.to);
  if (f.location) out.set("location", f.location);
  return out.toString();
}

// The stock book: what is in stock, and what it is worth today.
//
// Every figure here is worked out from the current price list rather than
// stamped onto the entry when it was made — so changing the gold rate re-values
// the whole book, exactly as the workbook does when its rate cell is edited.
// The price list is 13 KB and arrives once however many rows the page carries,
// which is why the pricing stayed here rather than moving to the server: priced
// figures would be paid for per row and came to about twice the payload.
export default function StockBookClient({
  rows: saved,
  prices,
  locations,
  total,
  cap,
  more,
  filtered,
  initialQuery,
  initialFrom,
  initialTo,
  initialLocation,
}: {
  rows: StockRow[];
  prices: PriceList;
  locations: string[];
  total: number;
  cap: number;
  more: boolean;
  filtered: boolean;
  initialQuery: string;
  initialFrom: string;
  initialTo: string;
  initialLocation: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<StockRow[]>(saved);
  const [q, setQ] = useState(initialQuery);
  // All four are held here as well as in the address bar: typing is answered
  // straight away out of the rows in hand, and the address bar catches up a
  // moment later so the server can fetch the rows that are not.
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [location, setLocation] = useState(initialLocation);
  // A MIX row stands for several stone sizes. The workbook keeps their breakup
  // on a second sheet; here the row opens onto it.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  // The filters, into the address bar, a moment after the last keystroke.
  //
  // That round trip is what fetches the rows this page has not got: the server
  // narrows the book and sends back the entries the filters name. Waiting out
  // the typing matters — one trip per letter would be one request per letter.
  const wanted = asQuery({ q, from, to, location });
  const current = asQuery({
    q: initialQuery, from: initialFrom, to: initialTo, location: initialLocation,
  });
  useEffect(() => {
    if (wanted === current) return;
    const timer = setTimeout(() => {
      router.replace(wanted ? `/stockbook?${wanted}` : "/stockbook", { scroll: false });
    }, 400);
    return () => clearTimeout(timer);
  }, [wanted, current, router]);

  // The page the server sent, taken up as the rows in hand. A filter change is
  // a fresh page of the book, so what is held has to be replaced by it, and so
  // does the refresh after a piece has been taken out.
  useEffect(() => setRows(saved), [saved]);

  // Dates are stored as yyyy-mm-dd, which compares correctly as text.
  const shown = useMemo(() => {
    // The same filtering as ever, over the rows this page was given. The server
    // has already narrowed the book to those; this is what answers a keystroke
    // before the round trip catches up, and the phrase goes through
    // searchStock() on both sides so the two can never disagree about what it
    // names.
    const scoped = rows.filter((e) => {
      if (from && !(e.date && e.date >= from)) return false;
      if (to && !(e.date && e.date <= to)) return false;
      if (location && e.location !== location) return false;
      return true;
    });
    return searchStock(scoped, q);
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

  async function del(e: StockRow) {
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
            {/* Every place the book has ever held stock in, counted by the
                database. The page's own rows would only ever list the ones it
                happens to be showing. */}
            {locations.map((l) => <option key={l} value={l}>{l}</option>)}
            {/* A place set in the address bar that is not in the list any more
                still shows what it is filtering by. */}
            {location && !locations.includes(location) && (
              <option value={location}>{location}</option>
            )}
          </select></label>
        {(from || to || location) && (
          <button type="button" className="linkbtn"
            onClick={() => { setFrom(""); setTo(""); setLocation(""); }}>
            Clear filters
          </button>
        )}
      </div>

      {/* The book is thousands of pieces and a page may only carry so many, so
          when it is cut short it says so and says what to do about it. Silence
          here would read as a book that had lost entries. */}
      {more && (
        <p className="jg-focus">
          {filtered
            ? `More than ${plain(cap)} pieces match. Narrow the dates or the place to see the rest.`
            : `Showing the latest ${plain(cap)} pieces. Use the dates, the place or the search box to find older ones.`}
        </p>
      )}

      {error && <p className="save-error" style={{ marginTop: 0 }}>{error}</p>}

      {shown.length === 0 ? (
        <div className="empty-state">
          {/* An empty page under a filter is not an empty book, and must not
              read as one: the dates or the search found nothing, which is a
              different thing to say. */}
          <p>
            {rows.length === 0 && !filtered
              ? "Nothing in stock yet. Take a finished piece in to start the book."
              : "No pieces match that."}
          </p>
          {rows.length === 0 && !filtered && (
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
                {valued.flatMap(({ e, p }) => {
                  const mix = isMix(e);
                  const one = e.lines[0];
                  const shown = open.has(e.id);
                  // "MIX" on its own says a piece has several sizes without
                  // saying which, so every cell that reads MIX opens the
                  // breakup rather than only being a label.
                  const mixCell = (label: string) =>
                    mix ? (
                      <button type="button" className="sb-mix" onClick={() => toggle(e.id)}
                        aria-expanded={shown}
                        aria-label={`${shown ? "Hide" : "Show"} the diamond sizes of ${e.stockNo}`}>
                        {MIX} {shown ? "▴" : "▾"}
                      </button>
                    ) : label || "—";
                  return [
                    <tr key={e.id} className={shown ? "sb-open" : undefined}>
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
                        {mix ? mixCell("") : trim(p.pointer, 2) || "—"}</td>
                      <td data-label="Shape">{mixCell(one?.shape || "")}</td>
                      <td data-label="Sieve / Size">{mixCell(one?.sieve || "")}</td>
                      <td data-label="Code">{mixCell(one?.code || "")}</td>
                      <td data-label="Total ($)" className="sb-num">{money(p.total.usd)}</td>
                      <td data-label="Total (₹)" className="sb-num">{money(p.total.inr)}</td>
                      <td className="jg-sr">
                        <button className="del" onClick={() => del(e)}
                          title="Remove from stock" aria-label="Remove from stock">×</button>
                      </td>
                    </tr>,
                    // The breakup, as the workbook's "Multiple Dia Entry" sheet
                    // keeps it: one line per stone size with its own price, and
                    // the gold, labour and piece total ruled off below.
                    ...(mix && shown ? [
                      <tr key={`${e.id}-lines`} className="sb-breakup">
                        <td colSpan={18}>
                          <div className="sb-breakup-in">
                            <h4>{e.stockNo} · {e.lines.length} diamond sizes</h4>
                            <table className="sb-sub">
                              <thead>
                                <tr>
                                  <th>#</th><th>Weight (cts)</th><th>Pcs</th><th>Shape</th>
                                  <th>Sieve / Size</th><th>Product Code</th>
                                  <th>Pointers</th><th>Price ($)</th><th>Price (₹)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {e.lines.map((l, i) => (
                                  <tr key={i}>
                                    <td>{i + 1}</td>
                                    <td className="sb-num">{l.breakupWt || "—"}</td>
                                    <td className="sb-num">{l.pcs || "—"}</td>
                                    <td>{l.shape || "—"}</td>
                                    <td>{l.sieve || "—"}</td>
                                    <td>{l.code || "—"}</td>
                                    <td className="sb-num">{trim(p.lines[i]?.pointer ?? null, 2) || "—"}</td>
                                    <td className="sb-num">{money(p.lines[i]?.diamond.usd ?? 0)}</td>
                                    <td className="sb-num">{money(p.lines[i]?.diamond.inr ?? 0)}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr>
                                  <td colSpan={6}>Diamonds</td>
                                  <td className="sb-num">{trim(p.totalWeight, 3)}</td>
                                  <td className="sb-num">{money(p.diamond.usd)}</td>
                                  <td className="sb-num">{money(p.diamond.inr)}</td>
                                </tr>
                                <tr>
                                  <td colSpan={7}>Gold · {p.karat}KT on {e.netWt || "0"} g net</td>
                                  <td className="sb-num">{money(p.gold.usd)}</td>
                                  <td className="sb-num">{money(p.gold.inr)}</td>
                                </tr>
                                <tr>
                                  <td colSpan={7}>Labour</td>
                                  <td className="sb-num">{money(p.labour.usd)}</td>
                                  <td className="sb-num">{money(p.labour.inr)}</td>
                                </tr>
                                <tr className="sb-grand">
                                  <td colSpan={7}>Total</td>
                                  <td className="sb-num">{money(p.total.usd)}</td>
                                  <td className="sb-num">{money(p.total.inr)}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </td>
                      </tr>,
                    ] : []),
                  ];
                })}
              </tbody>
            </table>
          </div>

          <div className="jg-foot">
            {/* How many pieces are on screen, out of how many the book holds.
                The four figures beside it are the totals of exactly the pieces
                on screen, and they say so, because the page is no longer given
                the whole book to add up. The book's own count is one question
                asked of the database, and this is where the office reads how
                big the book is, so it is worth asking. */}
            <span>{plain(shown.length)} of {plain(total)} pieces</span>
            <span>Diamonds shown <b>{trim(totals.cts, 3)}</b> cts</span>
            <span>Stones shown <b>{totals.pcs}</b></span>
            <span>Value shown <b>${money(totals.usd)}</b></span>
            <span>Value shown <b>₹{money(totals.inr)}</b></span>
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

// A figure as it is read out loud: 1000 is a thousand, written "1,000". The
// locale is named rather than left to the browser, so the page the server sends
// and the page the browser draws say the same thing.
function plain(n: number): string {
  return n.toLocaleString("en-US");
}

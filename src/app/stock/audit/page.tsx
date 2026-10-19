import type { ReactNode } from "react";
import Link from "next/link";
import { auditStockNos, MAX_AUDIT_NOS } from "@/lib/stockAudit";
import { formatDate, outcomeLabel } from "@/lib/memoFormat";
import { nothingIn, qcVerdict, type AuditBlock } from "@/lib/stockAuditFormat";
import AuditForm from "./AuditForm";
import AuditActions from "./AuditActions";

export const metadata = { title: "Stock Number Audit — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

// The pasted list travels in the address, so the report can be printed, kept
// open in a tab, bookmarked and sent to the Excel download as the same
// question. Nothing is saved anywhere: this screen only reads.
export default async function StockAuditPage(props: {
  searchParams: Promise<{ nos?: string }>;
}) {
  const searchParams = await props.searchParams;
  const nos = searchParams.nos || "";

  if (!nos.trim()) {
    return (
      <div className="wrap">
        <div className="page-head">
          <h1>Stock number audit</h1>
          <Link href="/stock" className="btn">Stock ledger</Link>
        </div>
        <p className="audit-lead">
          Paste the stock numbers and this gathers everything the portal knows
          about each one, from every screen that records a stock number.
        </p>
        <AuditForm value="" />
      </div>
    );
  }

  const report = await auditStockNos(nos);
  const unread = report.modules.filter((m) => !m.ok);

  return (
    <div className="wrap audit">
      <div className="page-head no-print">
        <h1>Stock number audit</h1>
        <AuditActions nos={nos} />
      </div>

      <div className="no-print">
        <AuditForm value={nos} />
      </div>

      <div className="audit-title print-only">
        <h1>Stock number audit</h1>
        <p>
          {report.blocks.length} stock number{report.blocks.length === 1 ? "" : "s"},
          looked up on {formatDate(new Date().toISOString().slice(0, 10))}.
        </p>
      </div>

      {report.blocks.length === 0 && (
        <div className="notice">
          No stock numbers were found in what was pasted. Put one number on each
          line.
        </div>
      )}

      {report.skipped.length > 0 && (
        <div className="notice">
          Only the first {MAX_AUDIT_NOS} numbers were looked up. {report.pasted} were
          pasted, so {report.skipped.length} were left out: {report.skipped.join(", ")}.
          Run them in a second batch.
        </div>
      )}

      {unread.length > 0 && (
        <div className="notice">
          <strong>Part of this report is missing.</strong>
          {unread.map((m) => (
            <p key={m.key} style={{ margin: "6px 0 0" }}>
              {m.label.charAt(0).toUpperCase() + m.label.slice(1)} could not be
              read, so nothing below says anything about it, either way.
              {m.error ? ` The reason given was: ${m.error}` : ""}
            </p>
          ))}
        </div>
      )}

      <p className="audit-rule">
        A number is matched exactly, ignoring upper and lower case, spaces and
        punctuation. So <code>s0053 c</code> finds <code>S0053C</code>.
        <br />
        <code>S0053C</code> and <code>S0053</code> are two different pieces and
        are never mixed up. Every finding below shows the number as it is
        actually written in that book.
      </p>

      {report.blocks.map((b) => (
        <Block key={b.key} b={b} />
      ))}
    </div>
  );
}

function Block({ b }: { b: AuditBlock }) {
  return (
    <section className={`audit-block${b.found ? "" : " empty"}`}>
      <h2>
        {b.asked}
        {!b.found && <span className="audit-none">Nothing found</span>}
      </h2>

      <div className="audit-answer">
        {b.headline.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>

      {b.found && (
        <div className="audit-detail">
          <Part title="The stock book" empty={nothingIn(b, "book")} has={!!b.book}>
            {b.book && (
              <>
                <dl className="audit-facts">
                  <Fact label="Number in the book" value={b.book.row.stockNo} />
                  <Fact label="Taken in on" value={b.book.row.date ? formatDate(b.book.row.date) : ""} />
                  <Fact label="Design" value={b.book.row.design} />
                  <Fact label="Design number" value={b.book.row.designNo} />
                  <Fact label="Category" value={b.book.row.category} />
                  <Fact label="Sub-category" value={b.book.row.subCategory} />
                  <Fact label="Sub-sub-category" value={b.book.row.subSubCategory} />
                  <Fact label="Gold" value={b.book.row.goldDetails} />
                  <Fact label="Gross weight" value={b.book.row.grossWt} />
                  <Fact label="Net weight" value={b.book.row.netWt} />
                  <Fact label="Place" value={b.book.row.location} />
                  <Fact label="Party" value={b.book.row.partyName} />
                  <Fact label="Comments" value={b.book.row.comments} />
                </dl>

                {b.book.row.lines.length > 0 && (
                  <table className="audit-table">
                    <thead>
                      <tr>
                        <th>Shape</th>
                        <th>Sieve / size</th>
                        <th className="num">Carats</th>
                        <th className="num">Stones</th>
                        <th>Product code</th>
                      </tr>
                    </thead>
                    <tbody>
                      {b.book.row.lines.map((l, i) => (
                        <tr key={i}>
                          <td>{l.shape || "—"}</td>
                          <td>{l.sieve || "—"}</td>
                          <td className="num">{l.breakupWt || "—"}</td>
                          <td className="num">{l.pcs || "—"}</td>
                          <td>{l.code || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <p className="audit-worth">
                  Worth about ${Math.round(b.book.price.total.usd).toLocaleString("en-US")} or
                  ₹{Math.round(b.book.price.total.inr).toLocaleString("en-IN")} at today&apos;s rates.
                  {b.book.price.totalWeight > 0 && (
                    <> {b.book.price.totalWeight.toFixed(3)} carats of diamonds in {b.book.price.totalPcs} stones.</>
                  )}
                  {b.book.price.unknownCodes.length > 0 && (
                    <>
                      {" "}
                      This figure is short: the price list has nothing under{" "}
                      {b.book.price.unknownCodes.join(", ")}.
                    </>
                  )}
                </p>
                <p className="audit-link">
                  <Link href={`/stockbook/${b.book.row.id}`}>Open this entry in the stock book</Link>
                </p>
              </>
            )}
          </Part>

          <Part title="Memos" empty={nothingIn(b, "memos")} has={b.memos.length > 0}>
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Memo</th>
                  <th>Date</th>
                  <th>Went to</th>
                  <th>Purpose</th>
                  <th>Listed as</th>
                  <th>Written as</th>
                  <th>What became of it</th>
                </tr>
              </thead>
              <tbody>
                {b.memos.map((m, i) => (
                  <tr key={i}>
                    <td className="memono">
                      <Link href={`/memo/${m.memoId}`}>{m.memoNo}</Link>
                      {m.kind === "gold" && " (gold)"}
                    </td>
                    <td>{formatDate(m.date)}</td>
                    <td>{m.to || "—"}</td>
                    <td>{m.purpose || "—"}</td>
                    <td>{m.type || "—"}</td>
                    <td>{m.storedNo}</td>
                    <td>
                      <span className={`out-tag ${m.outcome || "open"}`}>
                        {outcomeLabel(m.outcome)}
                      </span>
                      {m.event && (
                        <span className="ev-meta">
                          {m.event.replacedBy && <> · replaced by {m.event.replacedBy}</>}
                          {m.event.note && <> · {m.event.note}</>}
                          {m.event.by && <> · recorded by {m.event.by}</>}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Part>

          <Part
            title="The jangad register"
            empty={nothingIn(b, "jangad")}
            has={b.jangad.length > 0}
          >
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Entry</th>
                  <th>Date</th>
                  <th>Design</th>
                  <th>Piece</th>
                  <th>Factory</th>
                  <th>Stone</th>
                  <th className="num">Out</th>
                  <th className="num">Used</th>
                  <th className="num">Back</th>
                  <th>Status</th>
                  <th>Written as</th>
                </tr>
              </thead>
              <tbody>
                {b.jangad.map((j) => (
                  <tr key={j.id}>
                    <td className="memono">{j.id}</td>
                    <td>{j.date ? formatDate(j.date) : "—"}</td>
                    <td>{j.designNo || "—"}</td>
                    <td>{j.subDesignNo || "—"}</td>
                    <td>{j.mfgName || "—"}</td>
                    <td>{[j.shape, j.size].filter(Boolean).join(" ") || "—"}</td>
                    <td className="num">{cts(j.carats, j.pcs)}</td>
                    <td className="num">{cts(j.ctsUsed, j.pcsUsed)}</td>
                    <td className="num">{cts(j.ctsReturn, j.pcsReturn)}</td>
                    <td>{j.status || "—"}</td>
                    <td>{j.stockCode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="audit-note">
              Out is what the diamonds weighed when they went to the factory.
              Used is what came back set in the jewellery. Back is what came back
              loose.
            </p>
          </Part>

          <Part title="QC" empty={nothingIn(b, "qc")} has={b.qc.length > 0}>
            <table className="audit-table">
              <thead>
                <tr>
                  <th>QC</th>
                  <th>Date</th>
                  <th>Checked by</th>
                  <th>Verdict</th>
                  <th>Written as</th>
                  <th>Anything that failed</th>
                </tr>
              </thead>
              <tbody>
                {b.qc.map((q) => (
                  <tr key={q.id}>
                    <td className="memono">{q.qcNo}</td>
                    <td>{q.date ? formatDate(q.date) : "—"}</td>
                    <td>{q.checkedBy || "—"}</td>
                    <td>
                      <span className={`out-tag ${q.result === "fail" ? "lost" : q.result === "pass" ? "returned" : "open"}`}>
                        {qcVerdict(q)}
                      </span>
                    </td>
                    <td>{q.stockNo}</td>
                    <td>{q.failed.length ? q.failed.join(", ") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Part>

          <Part title="PD sheets" empty={nothingIn(b, "pd")} has={b.pd.length > 0}>
            <table className="audit-table">
              <thead>
                <tr>
                  <th>PD sheet</th>
                  <th>Design number</th>
                  <th>Piece</th>
                  <th>Category</th>
                  <th>Written as</th>
                </tr>
              </thead>
              <tbody>
                {b.pd.map((p, i) => (
                  <tr key={`${p.id}-${i}`}>
                    <td className="memono">
                      <Link href={`/pd/${p.id}`}>{p.pdNo}</Link>
                    </td>
                    <td>{p.sku || "—"}</td>
                    <td>{p.pieceNo || "—"}</td>
                    <td>{p.product || "—"}</td>
                    <td>{p.stockNo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Part>

          <Part
            title="The Google stock sheet"
            empty={nothingIn(b, "sheet")}
            has={!!b.sheet}
          >
            {b.sheet && (
              <dl className="audit-facts">
                <Fact label="Number in the sheet" value={b.sheet.stockNo} />
                <Fact label="Location" value={b.sheet.location || "nothing written"} />
                <Fact
                  label="Can go out on a memo"
                  value={b.sheet.state === "available" ? "Yes" : "No"}
                />
                <Fact label="Why not" value={b.sheet.reason} />
              </dl>
            )}
          </Part>
        </div>
      )}
    </section>
  );
}

// A section that always says something. An empty one carries the sentence that
// says why it is empty, because a blank space is left to be interpreted and
// this report is read by somebody taking it at its word.
function Part({
  title, empty, has, children,
}: {
  title: string;
  empty: string;
  has: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="audit-part">
      <h3>{title}</h3>
      {has ? children : <p className="audit-empty">{empty}</p>}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  if (!value || !value.trim()) return null;
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

// "1.250 ct, 45 pcs" out of the register's two columns, blank when neither was
// filled in. The register keeps every figure as the text it was typed as, so
// nothing is converted here either.
function cts(carats: string, pcs: string): string {
  const parts = [carats && `${carats} ct`, pcs && `${pcs} pcs`].filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}

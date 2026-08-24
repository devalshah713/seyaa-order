import Logo from "./Logo";
import { COMPANY, formatDate } from "@/lib/memoFormat";
import { mergeSpans, num, type JangadRow } from "@/lib/jangadConfig";

// The paper that goes out with the stones: what was handed to which factory,
// against which memo, for the manufacturer to sign and keep with their copy.
//
// One sheet per factory per memo. Selecting several designs and printing once
// is the point — a memo carries more than one design — but two factories must
// never end up on the same sheet, so they are split onto their own pages.

type Group = { mfgName: string; memoNo: string; rows: JangadRow[] };

function groupRows(rows: JangadRow[]): Group[] {
  const out: Group[] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && last.mfgName === r.mfgName && last.memoNo === r.memoNo) {
      last.rows.push(r);
      continue;
    }
    // Rows for the same factory and memo that were selected apart still belong
    // on one sheet, so an existing group is reopened rather than started again.
    const existing = out.find((g) => g.mfgName === r.mfgName && g.memoNo === r.memoNo);
    if (existing) existing.rows.push(r);
    else out.push({ mfgName: r.mfgName, memoNo: r.memoNo, rows: [r] });
  }
  return out;
}

const MIN_ROWS = 10;

export default function JangadSlipView({ rows }: { rows: JangadRow[] }) {
  const groups = groupRows(rows);
  return (
    <>
      {groups.map((g, i) => <Slip key={i} group={g} />)}
    </>
  );
}

function Slip({ group }: { group: Group }) {
  const rows = group.rows;
  const spans = mergeSpans(rows);
  const pad = Math.max(0, MIN_ROWS - rows.length);
  const sum = (k: "pcs" | "carats") =>
    rows.reduce((n, r) => n + (num(r[k]) ?? 0), 0);
  const pcs = sum("pcs");
  const carats = sum("carats");

  // Columns the factory has no use for are left off rather than printed empty.
  const showSetting = rows.some((r) => r.setting);
  const showCerti = rows.some((r) => r.certiNo);
  const optional = (showSetting ? 1 : 0) + (showCerti ? 1 : 0);
  // Sr, Design, Sub, Product, Shape, [Setting], [Certi], Size, Pcs, Carats, CVD.
  const cols = 9 + optional;
  // Everything up to and including Size, so the two figures below land under
  // Pcs and Carats — the columns they are the totals of.
  const beforeTotals = 6 + optional;

  // Every row of one issue carries the same date, so the sheet takes the first.
  const date = rows[0]?.date || "";

  return (
    <div className="jg-slip">
      <div className="dd-head">
        <Logo height={44} className="mark" />
        <div className="dd-title">
          <h2>{COMPANY.name}</h2>
          <p>Diamond Issue — Jangad</p>
        </div>
        <div className="dd-meta">
          <div><span>Date</span><b>{date ? formatDate(date) : ""}</b></div>
          {group.memoNo && <div><span>Memo No.</span><b>{group.memoNo}</b></div>}
        </div>
      </div>

      <p className="jg-slip-to">
        <span>Issued to</span>
        <b>{group.mfgName || "—"}</b>
      </p>

      <table className="jg-slip-table">
        <thead>
          <tr>
            <th className="c-sr">Sr.</th>
            <th className="c-design">Design No</th>
            <th className="c-sub">Sub Design</th>
            <th className="c-prod">Product</th>
            <th className="c-shape">Shape</th>
            {showSetting && <th className="c-shape">Setting</th>}
            {showCerti && <th className="c-certi">Certi No.</th>}
            <th className="c-size">Size</th>
            <th className="c-num">Pcs</th>
            <th className="c-num">Carats</th>
            <th className="c-shape">CVD/HPHT</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            // The design is written once and ruled down its rows, as in the
            // register and the workbook it comes from.
            const dSpan = spans.get("designNo")?.get(i);
            const pSpan = spans.get("product")?.get(i);
            const sSpan = spans.get("subDesignNo")?.get(i);
            return (
              <tr key={r.id}>
                <td className="c-sr">{i + 1}</td>
                {dSpan !== undefined && (
                  <td className="c-design merged" rowSpan={dSpan}>{r.designNo}</td>
                )}
                {sSpan !== undefined && (
                  <td className="c-sub merged" rowSpan={sSpan}>{r.subDesignNo}</td>
                )}
                {pSpan !== undefined && (
                  <td className="c-prod merged" rowSpan={pSpan}>{r.product}</td>
                )}
                <td className="c-shape">{r.shape}</td>
                {showSetting && <td className="c-shape">{r.setting}</td>}
                {showCerti && <td className="c-certi">{r.certiNo}</td>}
                <td className="c-size">{r.size}</td>
                <td className="c-num">{r.pcs}</td>
                <td className="c-num">{r.carats}</td>
                <td className="c-shape">{r.growth}</td>
              </tr>
            );
          })}
          {Array.from({ length: pad }).map((_, i) => (
            <tr key={`e${i}`} className="empty">
              {Array.from({ length: cols }).map((_, c) => <td key={c} />)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="tot-lab" colSpan={beforeTotals}>Total</td>
            <td className="c-num">{pcs || ""}</td>
            <td className="c-num">{carats ? round(carats) : ""}</td>
            <td />
          </tr>
        </tfoot>
      </table>

      <p className="jg-slip-note">
        Received the diamonds listed above in good order, for manufacturing
        against the memo named on this sheet. They remain the property of{" "}
        {COMPANY.name} and are to be returned, studded or loose, on demand.
      </p>

      <div className="dd-signs">
        <div><div className="line" /><span>Issued By — For {COMPANY.name}</span></div>
        <div><div className="line" /><span>Received By</span></div>
      </div>
    </div>
  );
}

function round(n: number): string {
  return String(parseFloat(n.toFixed(3)));
}

import Logo from "./Logo";
import { COMPANY, formatDate } from "@/lib/memoFormat";
import { totalBags, totalPcs, type DemandRow } from "@/lib/demandConfig";

export type DemandSheetData = {
  demandNo?: string;
  date: string;
  issuedTo: string;
  notes: string;
  pdNo?: string;
  rows: DemandRow[];
};

const MIN_ROWS = 8;

// Print-ready replica of the paper diamond demand.
export default function DemandSheetView({ data }: { data: DemandSheetData }) {
  const rows = data.rows.filter(
    (r) => r.designNo || r.shape || r.pointers || r.pcs || r.bags
  );
  const pad = Math.max(0, MIN_ROWS - rows.length);
  const bodyRows = rows.length + pad;

  // A design usually takes several diamond sizes, so its number is written once
  // and merged down its own rows. Only runs of the *same* number merge, so two
  // designs sharing a demand still read separately.
  const designSpans = new Map<number, number>();
  for (let i = 0; i < rows.length; ) {
    let n = 1;
    while (i + n < rows.length && rows[i + n].designNo === rows[i].designNo) n++;
    designSpans.set(i, n);
    i += n;
  }

  return (
    <div className="dd-sheet">
      <div className="dd-head">
        <Logo height={44} className="mark" />
        <div className="dd-title">
          <h2>{COMPANY.name}</h2>
          <p>Diamond Demand</p>
        </div>
        <div className="dd-meta">
          <div><span>Demand No.</span><b>{data.demandNo || ""}</b></div>
          <div><span>Date</span><b>{data.date ? formatDate(data.date) : ""}</b></div>
          {data.issuedTo && <div><span>Issued to</span><b>{data.issuedTo}</b></div>}
          {data.pdNo && <div><span>PD Sheet</span><b>{data.pdNo}</b></div>}
        </div>
      </div>

      <table className="dd-table">
        <thead>
          <tr>
            <th className="c-date">Date</th>
            <th className="c-design">Design No</th>
            <th className="c-shape">Diamond Shape</th>
            <th className="c-pt">Diamond Pointers</th>
            <th className="c-num">Number Of Pcs</th>
            <th className="c-com">Comments</th>
            <th className="c-num">BAGS</th>
            <th className="c-growth">CVD/HPHT</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {/* Written once and merged down the whole table, as on paper. */}
              {i === 0 && (
                <td className="c-date merged" rowSpan={bodyRows}>
                  {data.date ? formatDate(data.date) : ""}
                </td>
              )}
              {/* One design number covers all of its diamond sizes. */}
              {designSpans.has(i) && (
                <td className="c-design merged" rowSpan={designSpans.get(i)}>
                  {r.designNo}
                </td>
              )}
              <td className="c-shape">{r.shape}</td>
              <td className="c-pt">{r.pointers}</td>
              <td className="c-num">{r.pcs}</td>
              <td className="c-com">{r.comments}</td>
              <td className="c-num">{r.bags}</td>
              <td className="c-growth">{r.growth}</td>
            </tr>
          ))}
          {Array.from({ length: pad }).map((_, i) => (
            <tr key={`e${i}`} className="empty">
              {/* The date cell above already spans these rows. */}
              {rows.length === 0 && i === 0 && (
                <td className="c-date merged" rowSpan={bodyRows} />
              )}
              <td className="c-design" /><td className="c-shape" /><td className="c-pt" />
              <td className="c-num" /><td className="c-com" /><td className="c-num" />
              <td className="c-growth" />
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className="tot-lab">Total</td>
            <td className="c-num">{totalPcs(rows) || ""}</td>
            <td />
            <td className="c-num">{totalBags(rows) || ""}</td>
            <td />
          </tr>
        </tfoot>
      </table>

      {data.notes && (
        <div className="dd-notes"><span>Notes</span><p>{data.notes}</p></div>
      )}

      <div className="dd-signs">
        <div><div className="line" /><span>Issued By</span></div>
        <div><div className="line" /><span>Received By</span></div>
      </div>
    </div>
  );
}

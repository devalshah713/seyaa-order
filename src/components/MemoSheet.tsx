import Logo from "./Logo";
import { COMPANY, formatDate } from "@/lib/memoFormat";

export type MemoSheetData = {
  memoNo: string;
  to: string;
  through: string;
  mobile: string;
  date: string; // yyyy-mm-dd
  purpose: string;
  comment: string;
  items: { type: string; stockNos: string[] }[];
};

const MIN_ROWS = 4;

// Presentational, print-ready memo. Pure — rendered identically on the server
// (saved memo view) and the client (live form preview).
export default function MemoSheet({ data }: { data: MemoSheetData }) {
  const rows = data.items.filter((it) => it.type || it.stockNos.length > 0);
  const total = rows.reduce((n, it) => n + it.stockNos.length, 0);
  const pad = Math.max(0, MIN_ROWS - rows.length);

  return (
    <div className="memo">
      <div className="letterhead">
        <Logo height={66} className="mark" />
        <div className="lh-text">
          <h2>{COMPANY.name}</h2>
          <p className="tagline">{COMPANY.tagline}</p>
          <p className="addr">{COMPANY.address}</p>
        </div>
      </div>
      <hr className="rule-gold" />
      <p className="doc-title">Delivery Memo</p>

      <div className="meta">
        <div>
          <div className="mrow"><span className="lab">To</span><span className="val">{data.to}</span></div>
          <div className="mrow"><span className="lab">Through</span><span className="val">{data.through}</span></div>
          <div className="mrow"><span className="lab">Mobile</span><span className="val">{data.mobile}</span></div>
        </div>
        <div>
          <div className="mrow"><span className="lab">Memo No.</span><span className="val strong">{data.memoNo}</span></div>
          <div className="mrow"><span className="lab">Date</span><span className="val">{data.date ? formatDate(data.date) : ""}</span></div>
          <div className="mrow"><span className="lab">Purpose</span><span className="val"><span className="purpose-pill">{data.purpose}</span></span></div>
        </div>
      </div>

      <div className="comment-line">
        <span className="lab">Comment</span>
        <div className="val">{data.comment}</div>
      </div>

      <table className="items">
        <thead>
          <tr><th className="sr">Sr.</th><th className="type">Type</th><th className="qty">Qty</th><th className="stock">Stock No.</th></tr>
        </thead>
        <tbody>
          {rows.map((it, i) => (
            <tr key={i}>
              <td className="sr">{i + 1}</td>
              <td className="type">{it.type}</td>
              <td className="qty">{it.stockNos.length || ""}</td>
              <td className="stock">{it.stockNos.join(",  ")}</td>
            </tr>
          ))}
          {Array.from({ length: pad }).map((_, i) => (
            <tr className="empty" key={`e${i}`}>
              <td className="sr">{rows.length + i + 1}</td>
              <td className="type">·</td>
              <td className="qty">·</td>
              <td className="stock">·</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} className="totlab">Total Jewellery (pcs)</td>
            <td className="totval qty">{total}</td>
            <td className="stock"></td>
          </tr>
        </tfoot>
      </table>

      <div className="terms">
        <h3>Acknowledgement of Entrustment</h3>
        <p className="jur">Subject to Mumbai Jurisdiction.</p>
        <ol>
          <li>The goods have been entrusted to me for the purpose of being shown to intending purchasers for approval / inspection.</li>
          <li>The goods remain your property and I have no right or interest in them.</li>
          <li>I agree not to sell, pledge, mortgage, hypothecate the said goods or otherwise deal with them in any manner till a sale note signed by you is passed or the full price is paid by you.</li>
          <li>The goods are to be returned to you forthwith whenever demanded back.</li>
          <li>I am responsible to you for the return of the said goods in the same condition as I have received them, and they are at my risk in all respects until I return them to you.</li>
        </ol>
      </div>

      <div className="signs">
        <div className="sign">
          <div className="line"><div className="who">Receiver&rsquo;s Signature</div></div>
        </div>
        <div className="sign">
          <div className="line"><div className="who">Authorised Signatory</div><div className="for">For {COMPANY.name}</div></div>
        </div>
      </div>
    </div>
  );
}

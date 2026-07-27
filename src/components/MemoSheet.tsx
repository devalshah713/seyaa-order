import Logo from "./Logo";
import { COMPANY, fmtTouch, fmtWeight, formatDate, type MemoKind } from "@/lib/memoFormat";

export type MemoSheetData = {
  memoNo: string;
  kind?: MemoKind;
  to: string;
  through: string;
  mobile: string;
  date: string; // yyyy-mm-dd
  purpose: string;
  comment: string;
  items: { type: string; stockNos: string[] }[];
  goldItems?: { description: string; touch: number; grossWt: number; fineWt: number }[];
  againstMemoNo?: string;
};

const MIN_ROWS = 4;

// Presentational, print-ready memo. Pure — rendered identically on the server
// (saved memo view) and the client (live form preview). The letterhead, meta
// block, terms and signatures are shared; only the title, the table and the
// wording of the undertaking differ between jewellery and gold.
export default function MemoSheet({ data }: { data: MemoSheetData }) {
  const gold = data.kind === "gold";
  const isReceipt = gold && /receipt/i.test(data.purpose);

  const jewelRows = data.items.filter((it) => it.type || it.stockNos.length > 0);
  const goldRows = (data.goldItems || []).filter(
    (r) => r.description || r.grossWt > 0 || r.touch > 0
  );
  const rowCount = gold ? goldRows.length : jewelRows.length;
  const pad = Math.max(0, MIN_ROWS - rowCount);

  const totalPcs = jewelRows.reduce((n, it) => n + it.stockNos.length, 0);
  const round3 = (n: number) => Math.round(n * 1000) / 1000;
  const totalGross = round3(goldRows.reduce((n, r) => n + (r.grossWt || 0), 0));
  const totalFine = round3(goldRows.reduce((n, r) => n + (r.fineWt || 0), 0));

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
      <p className="doc-title">{gold ? "Gold Memo" : "Delivery Memo"}</p>

      <div className="meta">
        <div>
          <div className="mrow"><span className="lab">{gold ? "Factory" : "To"}</span><span className="val">{data.to}</span></div>
          <div className="mrow"><span className="lab">Through</span><span className="val">{data.through}</span></div>
          <div className="mrow"><span className="lab">Mobile</span><span className="val">{data.mobile}</span></div>
        </div>
        <div>
          <div className="mrow"><span className="lab">Memo No.</span><span className="val strong">{data.memoNo}</span></div>
          <div className="mrow"><span className="lab">Date</span><span className="val">{data.date ? formatDate(data.date) : ""}</span></div>
          <div className="mrow"><span className="lab">Purpose</span><span className="val"><span className="purpose-pill">{data.purpose}</span></span></div>
          {gold && data.againstMemoNo && (
            <div className="mrow"><span className="lab">Against</span><span className="val strong">{data.againstMemoNo}</span></div>
          )}
        </div>
      </div>

      <div className="comment-line">
        <span className="lab">Comment</span>
        <div className="val">{data.comment}</div>
      </div>

      {gold ? (
        <table className="items gold">
          <thead>
            <tr>
              <th className="sr">Sr.</th>
              <th className="desc">Description</th>
              <th className="touch">Touch</th>
              <th className="wt">Gross Wt (g)</th>
              <th className="wt">Fine Wt (g)</th>
            </tr>
          </thead>
          <tbody>
            {goldRows.map((r, i) => (
              <tr key={i}>
                <td className="sr">{i + 1}</td>
                <td className="desc">{r.description}</td>
                <td className="touch">{fmtTouch(r.touch)}</td>
                <td className="wt">{fmtWeight(r.grossWt)}</td>
                <td className="wt">{fmtWeight(r.fineWt)}</td>
              </tr>
            ))}
            {Array.from({ length: pad }).map((_, i) => (
              <tr className="empty" key={`e${i}`}>
                <td className="sr">{goldRows.length + i + 1}</td>
                <td className="desc">·</td>
                <td className="touch">·</td>
                <td className="wt">·</td>
                <td className="wt">·</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="totlab">Total</td>
              <td className="totval wt">{fmtWeight(totalGross)}</td>
              <td className="totval wt">{fmtWeight(totalFine)}</td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <table className="items">
          <thead>
            <tr><th className="sr">Sr.</th><th className="type">Type</th><th className="qty">Qty</th><th className="stock">Stock No.</th></tr>
          </thead>
          <tbody>
            {jewelRows.map((it, i) => (
              <tr key={i}>
                <td className="sr">{i + 1}</td>
                <td className="type">{it.type}</td>
                <td className="qty">{it.stockNos.length || ""}</td>
                <td className="stock">{it.stockNos.join(",  ")}</td>
              </tr>
            ))}
            {Array.from({ length: pad }).map((_, i) => (
              <tr className="empty" key={`e${i}`}>
                <td className="sr">{jewelRows.length + i + 1}</td>
                <td className="type">·</td>
                <td className="qty">·</td>
                <td className="stock">·</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="totlab">Total Jewellery (pcs)</td>
              <td className="totval qty">{totalPcs}</td>
              <td className="stock"></td>
            </tr>
          </tfoot>
        </table>
      )}

      <div className="terms">
        {gold ? (
          <>
            <h3>{isReceipt ? "Acknowledgement of Receipt" : "Acknowledgement of Entrustment"}</h3>
            <p className="jur">Subject to Mumbai Jurisdiction.</p>
            {isReceipt ? (
              <ol>
                <li>The gold described above has been received back against the memo referenced, and the weights and touch shown have been jointly verified at the time of receipt.</li>
                <li>Any difference between the gold issued and the gold returned, including wastage, stands as recorded and agreed in writing separately.</li>
                <li>This receipt discharges the above quantity only, and does not settle any other gold still lying with the factory.</li>
                <li>Assay and touch shown are as determined at the time of receipt and are binding on both parties.</li>
              </ol>
            ) : (
              <ol>
                <li>The gold described above has been entrusted to me solely for job work / manufacturing on account of the owner.</li>
                <li>The gold remains the property of the owner at all times and I have no right, lien or interest in it.</li>
                <li>I agree not to sell, pledge, mortgage, hypothecate or otherwise deal with the said gold in any manner whatsoever.</li>
                <li>The gold, together with the finished goods and all scrap and dust arising from it, is to be returned forthwith whenever demanded.</li>
                <li>I am responsible for the full fine weight shown above and it remains at my risk in all respects until returned and duly acknowledged.</li>
              </ol>
            )}
          </>
        ) : (
          <>
            <h3>Acknowledgement of Entrustment</h3>
            <p className="jur">Subject to Mumbai Jurisdiction.</p>
            <ol>
              <li>The goods have been entrusted to me for the purpose of being shown to intending purchasers for approval / inspection.</li>
              <li>The goods remain your property and I have no right or interest in them.</li>
              <li>I agree not to sell, pledge, mortgage, hypothecate the said goods or otherwise deal with them in any manner till a sale note signed by you is passed or the full price is paid by you.</li>
              <li>The goods are to be returned to you forthwith whenever demanded back.</li>
              <li>I am responsible to you for the return of the said goods in the same condition as I have received them, and they are at my risk in all respects until I return them to you.</li>
            </ol>
          </>
        )}
      </div>

      <div className="signs">
        <div className="sign">
          <div className="line"><div className="who">{isReceipt ? "Delivered By" : "Receiver’s Signature"}</div></div>
        </div>
        <div className="sign">
          <div className="line"><div className="who">Authorised Signatory</div><div className="for">For {COMPANY.name}</div></div>
        </div>
      </div>
    </div>
  );
}

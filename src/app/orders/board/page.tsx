// The image that gets shared on WhatsApp. Rendered as a page so it can be
// screenshotted server-side and look identical every time, rather than relying
// on someone's phone screenshot.
//
// Sized for a phone: narrow, large type, high contrast. Delivered orders are
// left out so the board stays short enough to read in a group chat.
import { listOrders } from "@/lib/memoStore";
import {
  COMPANY,
  OPEN_STATUSES,
  formatDate,
  orderStatusLabel,
  todayInput,
  type OrderStatus,
} from "@/lib/memoFormat";
import Logo from "@/components/Logo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Order Board — Seyaa Solitaire" };

export default async function BoardPage() {
  const all = await listOrders().catch(() => []);
  const open = all.filter((o) => OPEN_STATUSES.includes(o.status));

  const groups: { status: OrderStatus; rows: typeof open }[] = OPEN_STATUSES.map((s) => ({
    status: s,
    rows: open.filter((o) => o.status === s),
  }));

  const totalPcs = open.reduce((n, o) => n + (o.pcs || 0), 0);
  const totalCts = Math.round(open.reduce((n, o) => n + (o.diamondCts || 0), 0) * 100) / 100;

  return (
    <div className="board">
      <div className="board-head">
        <Logo height={46} className="mark" />
        <div>
          <h1>{COMPANY.name}</h1>
          <p>Order Status · {formatDate(todayInput())}</p>
        </div>
      </div>

      {open.length === 0 ? (
        <p className="board-empty">No open orders.</p>
      ) : (
        groups.map((g) =>
          g.rows.length === 0 ? null : (
            <section key={g.status} className="board-group">
              <h2 className={`bg-${g.status}`}>
                {orderStatusLabel(g.status)}
                <span className="bg-count">{g.rows.length}</span>
              </h2>
              <table>
                <thead>
                  <tr>
                    <th className="bw-no">#</th>
                    <th>Product</th>
                    <th className="bw-mid">Gold</th>
                    <th className="bw-num">Cts</th>
                    <th className="bw-num">Pcs</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((o) => (
                    <tr key={o.id}>
                      <td className="bw-no">{o.orderNo.split("/").pop()}</td>
                      <td>
                        <strong>{o.productName}</strong>
                        {o.customer && <span className="b-cust">{o.customer}</span>}
                        {o.stockNo && <span className="b-stock">remake of {o.stockNo}</span>}
                        {/* Every note, newest first, so the current position
                            reads immediately under the product. */}
                        {(o.comments || [])
                          .slice()
                          .reverse()
                          .map((c) => (
                            <span key={c.id} className="b-note">
                              {c.text}
                              <em>{c.by}</em>
                            </span>
                          ))}
                      </td>
                      <td className="bw-mid">{o.goldColor || "—"}</td>
                      <td className="bw-num">{o.diamondCts ? o.diamondCts.toFixed(2) : "—"}</td>
                      <td className="bw-num">{o.pcs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )
        )
      )}

      <div className="board-foot">
        <span>{open.length} open order{open.length === 1 ? "" : "s"}</span>
        <span>{totalPcs} pcs · {totalCts.toFixed(2)} cts</span>
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrder } from "@/lib/sheetStore";
import { formatDate } from "@/lib/formConfig";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

type Line = {
  itemNo: string;
  productType: string;
  pieces: number;
  shape: string;
  size: string;
  stoneType: string;
  stoneColor: string;
  perPiece: number;
  total: number;
};

export default async function DiamondDemandPage({
  searchParams,
}: {
  searchParams: { id?: string };
}) {
  const orderNumber = searchParams.id || "";
  const order = orderNumber ? await getOrder(orderNumber) : null;
  if (!order) notFound();

  const lines: Line[] = [];
  for (const it of order.items) {
    const pieces = parseInt(it.quantity, 10) || 1;
    for (const d of it.diamonds) {
      const perPiece = parseFloat(d["Number of Diamonds"]) || 0;
      lines.push({
        itemNo: it.itemNo,
        productType: it.productType,
        pieces,
        shape: d["Diamond Shape"] || "",
        size: d["Diamond Size"] || "",
        stoneType: d["Stone Type"] || "",
        stoneColor: d["Stone Color"] || "",
        perPiece,
        total: perPiece * pieces,
      });
    }
  }

  const grandTotal = lines.reduce((s, l) => s + l.total, 0);

  return (
    <main className="container demand">
      <div className="row spread no-print" style={{ marginBottom: 16 }}>
        <Link href={`/orders/view?id=${encodeURIComponent(order.orderNumber)}`} className="muted">
          ← Back to order
        </Link>
        <PrintButton />
      </div>

      <div className="demand-sheet">
        <div className="demand-head">
          <div>
            <div className="brand-line">
              <b>SEYAA</b> <span>Diamond Demand</span>
            </div>
          </div>
          <div className="demand-meta">
            <div><span>Order No:</span> <b>{order.orderNumber}</b></div>
            <div><span>Date:</span> {formatDate(order.date) || "—"}</div>
            <div><span>Manufacturer:</span> <b>{order.manufacturer || "—"}</b></div>
            <div><span>Customer:</span> {order.customerName}</div>
            <div><span>Region:</span> {order.region}</div>
          </div>
        </div>

        {lines.length === 0 ? (
          <p className="muted">No diamond requirements on this order.</p>
        ) : (
          <table className="demand-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Product</th>
                <th>Shape</th>
                <th>Size</th>
                <th>Stone Type</th>
                <th>Stone Color</th>
                <th className="num">Dia / pc</th>
                <th className="num">Pcs</th>
                <th className="num">Total Dia</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td>{l.itemNo}</td>
                  <td>{l.productType}</td>
                  <td>{l.shape}</td>
                  <td>{l.size}</td>
                  <td>{l.stoneType}</td>
                  <td>{l.stoneColor}</td>
                  <td className="num">{l.perPiece || "—"}</td>
                  <td className="num">{l.pieces}</td>
                  <td className="num"><b>{l.total || "—"}</b></td>
                </tr>
              ))}
              <tr className="total-row">
                <td colSpan={8}>Total diamonds required</td>
                <td className="num"><b>{grandTotal}</b></td>
              </tr>
            </tbody>
          </table>
        )}

        {order.notes && (
          <div className="demand-notes">
            <span>Notes:</span> {order.notes}
          </div>
        )}
      </div>
    </main>
  );
}

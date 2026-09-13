import { listOrders, type Order } from "@/lib/memoStore";
import { OPEN_STATUSES, imagePartCount } from "@/lib/memoFormat";
import OrdersClient from "./OrdersClient";

export const metadata = { title: "Orders — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  let orders: Order[] = [];
  let error = "";
  try {
    orders = await listOrders();
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load orders.";
  }

  const open = orders.filter((o) => OPEN_STATUSES.includes(o.status)).length;
  const parts = imagePartCount(open);

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Orders</h1>
        <p>{open} open · {orders.length} total</p>
        {/* The portal used to photograph the board with a browser on the
            server and hand back a PNG to forward. That browser is a paid
            add-on on Cloudflare and this was the only thing using it, so the
            board is now just a page: open it and screenshot it.

            Still one link per part, because a long board is split so each part
            stays legible once WhatsApp scales it down. */}
        {Array.from({ length: parts }, (_, i) => (
          <a
            key={i}
            href={`/orders/board?part=${i + 1}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            {parts === 1 ? "Status board" : `Board ${i + 1} of ${parts}`}
          </a>
        ))}
      </div>
      {error ? <div className="notice">{error}</div> : <OrdersClient orders={orders} />}
    </div>
  );
}

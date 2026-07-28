import { listOrders, type Order } from "@/lib/memoStore";
import { OPEN_STATUSES } from "@/lib/memoFormat";
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

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Orders</h1>
        <p>{open} open · {orders.length} total</p>
        <a href="/api/orders/image" className="btn btn-primary">Download status image</a>
      </div>
      {error ? <div className="notice">{error}</div> : <OrdersClient orders={orders} />}
    </div>
  );
}

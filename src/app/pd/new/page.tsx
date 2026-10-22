import Link from "next/link";
import PdForm from "./PdForm";
import { getOrder } from "@/lib/memoStore";
import { approvalOf } from "@/lib/memoFormat";
import { pdPrefillFromOrder, type PdPrefill } from "@/lib/orderToPd";

export const metadata = { title: "New PD Sheet — Seyaa Solitaire" };
// The prefill is read out of the store on every request, so this page is never
// prerendered. It also reads the order's id from the address, which a built
// page cannot know.
export const dynamic = "force-dynamic";

// How the prefill travels: the order's own id in the address, and the order
// read from the store here.
//
// Nothing of the order is put in the URL itself. A sheet's worth of fields in a
// query string would be a thousand characters of typed text, a picture URL and
// the special instructions — long enough to be cut off by something in the
// middle, and unreadable in a phone's address bar. An id survives a refresh,
// can be sent to somebody, and is the same length whatever the order says.
export default async function NewPdPage(props: {
  searchParams: Promise<{ order?: string }>;
}) {
  const searchParams = await props.searchParams;
  const orderId = (searchParams.order || "").trim();

  let prefill: PdPrefill | undefined;
  let fromOrder: { id: string; orderNo: string } | undefined;
  let notice = "";

  if (orderId) {
    const order = await getOrder(orderId).catch(() => null);
    // "Not there" is said rather than quietly opening an empty form, which
    // would look like the order's details simply failed to arrive.
    if (!order) {
      notice = "That order could not be found, so nothing has been filled in.";
    } else if (approvalOf(order) !== "approved") {
      notice =
        `Order ${order.orderNo} is not approved yet, so its PD sheet cannot be ` +
        "started. It can be started as soon as it is approved.";
    } else if (order.pdId) {
      notice =
        `Order ${order.orderNo} already has PD sheet ${order.pdNo || order.pdId}. ` +
        "Open that sheet rather than starting a second one.";
    } else {
      prefill = pdPrefillFromOrder(order);
      fromOrder = { id: order.id, orderNo: order.orderNo };
    }
  }

  if (notice) {
    return (
      <div className="wrap">
        <div className="page-head">
          <h1>New PD sheet</h1>
          <Link href="/orders" className="btn">← All orders</Link>
          <Link href="/pd/new" className="btn btn-primary">Start a blank sheet</Link>
        </div>
        <div className="notice">{notice}</div>
      </div>
    );
  }

  return <PdForm prefill={prefill} fromOrder={fromOrder} />;
}

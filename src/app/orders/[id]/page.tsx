import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrder, listPartyNames } from "@/lib/memoStore";
import { currentSession } from "@/lib/currentUser";
import { approvalLabel, approvalOf, formatDate, orderStatusLabel } from "@/lib/memoFormat";
import { photoSrc } from "@/lib/cloudinary";
import OrderAssign from "./OrderAssign";
import OrderApprovalPanel from "./OrderApprovalPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Order — Seyaa Solitaire" };

// One line of the record. Left out entirely when there is nothing in it, so
// the page is what was written rather than a wall of dashes.
function Row({ label, value }: { label: string; value?: string | number }) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  if (!text) return null;
  return (
    <div className="ord-row">
      <span>{label}</span>
      <strong>{text}</strong>
    </div>
  );
}

export default async function OrderPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const order = await getOrder(params.id).catch(() => null);
  if (!order) notFound();

  const session = await currentSession();
  const isAdmin = session?.role === "admin";

  // Only an admin is offered the manufacturer list, because only an admin can
  // set it. Reading it for everybody else would be a list nobody can use.
  let mfgs: string[] = [];
  if (isAdmin) {
    try {
      const lists = await listPartyNames(["mfg"]);
      mfgs = (lists.mfg || []).map((e) => e.name);
    } catch {
      mfgs = [];
    }
  }

  const photoUrl = photoSrc(order.photoPath);

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>{order.orderNo}</h1>
        <p>{approvalLabel(order)} · {orderStatusLabel(order.status)}</p>
        <Link href="/orders" className="btn">← All orders</Link>
        <Link href="/orders/new" className="btn btn-primary">New order</Link>
      </div>

      <div className="ord-view">
        <div className="ord-pic">
          {photoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={photoUrl} alt="Reference" />
          ) : order.driveLink ? (
            <a href={order.driveLink} target="_blank" rel="noopener noreferrer" className="btn">
              Open the Drive link
            </a>
          ) : (
            <p className="hint">No reference picture on this order.</p>
          )}
          {photoUrl && order.driveLink && (
            <a href={order.driveLink} target="_blank" rel="noopener noreferrer" className="hint">
              Drive link
            </a>
          )}
        </div>

        <div className="ord-facts">
          <h2>{order.productName}</h2>
          <Row label="Category" value={order.category} />
          <Row label="Sub-category" value={order.subCategory} />
          <Row label="Sub-sub-category" value={order.subSubCategory} />
          <Row label="Gold" value={order.goldColor} />
          <Row label="Pieces" value={order.pcs} />
          <Row label="Size" value={order.size} />
          <Row label="Diamond shape" value={order.diaShape} />
          <Row
            label="Diamond weight"
            value={order.diamondCts ? `${order.diamondCts.toFixed(2)} cts` : ""}
          />
          <Row label="Sieve or size" value={order.sieveSize} />
          <Row label="Stone pieces" value={order.stonePcs} />
          <Row label="Remake of" value={order.stockNo} />
          <Row label="Party" value={order.customer} />
          <Row label="Special instructions" value={order.instructions} />

          {/* The stamp. Shown here because knowing who took an order and when
              is the first question asked about it, and nothing on this page
              can change any of the three. */}
          <div className="ord-stamp">
            <Row label="Entered by" value={order.enteredBy || "not recorded"} />
            <Row
              label="Entered on"
              value={`${formatDate(order.createdAt.slice(0, 10))} ${order.createdAt.slice(11, 16)}`}
            />
          </div>
        </div>
      </div>

      <OrderApprovalPanel
        id={order.id}
        approval={approvalOf(order)}
        approverName={order.approverName || ""}
        sentBackReason={order.sentBackReason || ""}
        canApprove={
          approvalOf(order) !== "approved" &&
          order.enteredBy !== session?.username &&
          (isAdmin || (!!order.approverId && order.approverId === session?.uid))
        }
        canResubmit={approvalOf(order) === "sent_back" && order.enteredBy === session?.username}
      />

      <OrderAssign
        id={order.id}
        mfg={order.mfg || ""}
        designNo={order.designNo || ""}
        mfgs={mfgs}
        isAdmin={isAdmin}
      />

      {(order.comments || []).length > 0 && (
        <div className="ord-notes">
          <h2>Notes</h2>
          {(order.comments || []).slice().reverse().map((c) => (
            <div key={c.id} className="row-note">
              {c.text}
              <em>{c.by}</em>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

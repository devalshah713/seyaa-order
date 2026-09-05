import Link from "next/link";
import { currentSession } from "@/lib/currentUser";
import {
  isReceiptChaseStorageConfigured, listReceiptChases, type ReceiptChase,
} from "@/lib/receiptChaseStore";
import { isReceiptWebhookConfigured } from "@/lib/receiptWebhook";
import { FIRST_GAP_HOURS, REPEAT_GAP_HOURS } from "@/lib/chaseTime";
import ReceiptChaseClient from "./ReceiptChaseClient";

export const metadata = { title: "Diamond Receipts — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

export default async function ReceiptChasePage() {
  if (!isReceiptChaseStorageConfigured()) {
    return (
      <div className="wrap">
        <div className="page-head"><h1>Diamond Receipts</h1></div>
        <div className="notice">
          Storage isn&rsquo;t configured yet. Add the <code>BLOB_READ_WRITE_TOKEN</code>{" "}
          environment variable in Vercel and redeploy.
        </div>
      </div>
    );
  }

  const session = await currentSession();
  let chases: ReceiptChase[] = [];
  let error = "";
  try {
    chases = await listReceiptChases();
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load the chase list.";
  }

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Diamond Receipts</h1>
        <Link href="/demand" className="btn">All Demands</Link>
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        Every diamond demand is watched from the moment it goes to the diamond team
        until the bags appear on the jangad as an issue entry. The first reminder is{" "}
        {FIRST_GAP_HOURS} hours after it was issued, then every {REPEAT_GAP_HOURS} hours
        — only between 8am and 7pm, Monday to Friday. Each one reaches Deval through the
        Grok Bot with the text ready to forward to{" "}
        <b>Diamond bagging group internal</b>. Nothing is sent to WhatsApp automatically.
      </p>
      {/* The cadence above is what the portal works to; how often anything
          actually looks is set by the schedule in vercel.json — every five
          minutes, so a reminder goes out within minutes of falling due. */}
      <p className="hint">
        The portal checks every few minutes, so a reminder goes out close to when it
        falls due. <b>Run the checks now</b> sends everything outstanding immediately.
      </p>
      {error ? (
        <div className="notice">{error}</div>
      ) : (
        <ReceiptChaseClient
          chases={chases}
          isAdmin={session?.role === "admin"}
          webhookOn={isReceiptWebhookConfigured()}
          renderedAt={new Date().toISOString()}
        />
      )}
    </div>
  );
}

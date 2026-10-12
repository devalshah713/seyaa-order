import Link from "next/link";
import { currentSession } from "@/lib/currentUser";
import {
  isReceiptChaseStorageConfigured, listReceiptChases, type ReceiptChase,
} from "@/lib/receiptChaseStore";
import { firstGapHours, repeatGapHours } from "@/lib/chaseTime";
import ReceiptChaseClient from "./ReceiptChaseClient";

export const metadata = { title: "Diamond Receipts — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

export default async function ReceiptChasePage() {
  if (!isReceiptChaseStorageConfigured()) {
    return (
      <div className="wrap">
        <div className="page-head"><h1>Diamond Receipts</h1></div>
        <div className="notice">
          Storage isn&rsquo;t configured yet. Set the four <code>R2_*</code>{" "}
          environment variables and redeploy.
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
    // The wide layout, the same one the jangad and the stock book use. Nine
    // columns do not fit the ordinary 1000px page, so the table used to run off
    // the right and take the whole window's sideways scrollbar with it.
    <div className="wrap jg-wrap">
      <div className="page-head">
        <h1>Diamond Receipts</h1>
        <Link href="/demand" className="btn">All Demands</Link>
      </div>
      {/* The explanation is folded away because the people who use this screen
          every day already know it, and it was pushing the counts and the
          search box below the fold. It stays one click away for anybody who
          does not know it, and it opens closed every time: a page that
          remembers it was left open is a page that is clean for one person and
          not for the next. */}
      <details className="rc-how">
        <summary>How this works</summary>
        <p className="hint">
          Every diamond demand is watched from the moment it goes to the diamond team
          until the bags appear on the jangad as an issue entry. The first reminder is{" "}
          {firstGapHours()} hours after it was issued, then every {repeatGapHours()} hours
          while it stays outstanding. Each reminder is recorded here with its text
          ready on the row, to copy into the WhatsApp group{" "}
          <b>Diamond bagging group internal</b>. Nothing is sent anywhere automatically.
        </p>
        {/* The cadence above is what the portal works to; how often anything
            actually looks is set by the schedule in vercel.json, once each
            working morning. Saying so stops the accounts desk waiting for a
            reminder that no run exists to send. */}
        <p className="hint">
          The portal checks <b>once each morning at 8am India time, Monday to Saturday</b>,
          so at most one reminder per design per working day, and none on Sunday.
          <b> Run the checks now</b> records a reminder for everything outstanding
          immediately, any time.
        </p>
      </details>
      {error ? (
        <div className="notice">{error}</div>
      ) : (
        <ReceiptChaseClient
          chases={chases}
          isAdmin={session?.role === "admin"}
          renderedAt={new Date().toISOString()}
        />
      )}
    </div>
  );
}

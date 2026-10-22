"use client";
// Where an order stands in the approval chain, and the one or two buttons the
// person reading it is allowed to press.
//
// Whether they are allowed is decided on the server; this only hides what
// would be refused anyway, so the page does not offer somebody a button that
// answers back.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { APPROVAL_LABELS, type OrderApproval } from "@/lib/memoFormat";
import { readReply } from "@/lib/readReply";

export default function OrderApprovalPanel({
  id,
  approval,
  approverName,
  sentBackReason,
  canApprove,
  canResubmit,
}: {
  id: string;
  approval: OrderApproval;
  approverName: string;
  sentBackReason: string;
  canApprove: boolean;
  canResubmit: boolean;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function act(action: string, why?: string) {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${id}/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: why || "" }),
      });
      await readReply(res, "Could not save that.");
      setAsking(false);
      setReason("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`ord-approval a-${approval}`}>
      <h2>{APPROVAL_LABELS[approval]}</h2>
      {approval === "waiting" && (
        <p className="hint">
          Waiting for approval{approverName ? ` from ${approverName}` : ""}.
          <br />
          It has its number and it is saved in full. It does not go ahead until
          it is approved.
        </p>
      )}
      {approval === "sent_back" && (
        <p className="hint">
          Sent back{approverName ? ` by ${approverName}` : ""}.
          {sentBackReason ? <> Reason: <b>{sentBackReason}</b></> : null}
          <br />
          Correct it, then send it in again.
        </p>
      )}
      {approval === "approved" && <p className="hint">This order can go ahead.</p>}

      {canApprove && (
        <div className="q-actions">
          <button className="btn btn-primary" disabled={busy} onClick={() => act("approve")}>
            Approve
          </button>
          <button className="btn" disabled={busy} onClick={() => setAsking(!asking)}>
            Send back
          </button>
        </div>
      )}
      {canApprove && asking && (
        <div className="q-back">
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is it going back? One line."
          />
          <button
            className="btn btn-primary"
            disabled={!reason.trim() || busy}
            onClick={() => act("send_back", reason)}
          >
            Send it back
          </button>
          <button className="btn" onClick={() => { setAsking(false); setReason(""); }}>
            Cancel
          </button>
        </div>
      )}
      {canResubmit && (
        <div className="q-actions">
          <button className="btn btn-primary" disabled={busy} onClick={() => act("resubmit")}>
            Send in again
          </button>
        </div>
      )}
      {error && <p className="save-error">{error}</p>}
    </div>
  );
}

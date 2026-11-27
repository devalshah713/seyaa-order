// Where an order starts its approval, decided in one place.
//
// The firm has a shape, and the chain follows it rather than inventing one:
// the head at the top, a manager or two under him, their sellers under them,
// and everybody else reporting to the head directly.
//
//   Dhruval or Shalin enter an order  ->  Rahul  ->  the head  ->  it goes ahead
//   anybody reporting to the head     ->  the head            ->  it goes ahead
//   the head enters one himself       ->  it goes ahead
//
// Three rules come out of that, and all three matter:
//
// An order entered by an admin is approved as it is written. An admin is the
// head of the firm; there is nobody above him to ask. Making him wait for a
// second admin would leave a one-admin office unable to place an order at all,
// which is not control, it is a dead end.
//
// A seller whose manager is an admin waits once, not twice. Without this the
// head would approve as the manager and then be asked again as the owner, and
// a person pressing the same button twice stops reading what is on it.
//
// Everybody else waits for their manager and then for the head, which is what
// the owner asked for: no order goes ahead without his word on it.
import "server-only";
import { managerOf } from "./userStore";
import type { OrderApproval, OrderApprovalStage } from "./memoFormat";

export type ApprovalStart = {
  approval: OrderApproval;
  stage: OrderApprovalStage;
  approverId: string;
  approverName: string;
};

// `by` is the signed-in account that is writing or correcting the order, never
// anything read off the request.
// Accounts whose own orders are approved as they are entered, by the owner's
// word. Grok is the agent that types in orders the owner has already approved
// on the sellers' sheets, so asking him again for each one would only mean
// pressing Approve once per row. An entry may carry an end; one without an end
// stays until it is removed from this list.
//
// This only covers orders the account enters itself. It cannot approve, edit
// or delete anybody else's.
const SELF_APPROVE: { username: string; until?: string }[] = [
  { username: "grok" },
];

export function selfApproves(username: string, now = Date.now()): boolean {
  const name = (username || "").trim().toLowerCase();
  return SELF_APPROVE.some(
    (s) => s.username === name && (!s.until || now < Date.parse(s.until))
  );
}

export async function approvalStartFor(by: {
  uid: string;
  role: string;
  username?: string;
}): Promise<ApprovalStart> {
  const approved: ApprovalStart = {
    approval: "approved",
    stage: "owner",
    approverId: "",
    approverName: "",
  };
  const owner: ApprovalStart = {
    approval: "waiting",
    stage: "owner",
    approverId: "",
    approverName: "",
  };

  if (by.role === "admin") return approved;
  if (selfApproves(by.username || "")) {
    return { ...approved, approverName: by.username || "" };
  }

  const manager = await managerOf(by.uid);
  if (!manager || manager.role === "admin") return owner;

  return {
    approval: "waiting",
    stage: "manager",
    approverId: manager.id,
    approverName: manager.username,
  };
}

// What to write in the log when an order starts or restarts its chain, so the
// trail says who it is sitting with in the same words the screen does.
export function approvalStartNote(start: ApprovalStart, corrected: boolean): string {
  const opening = corrected ? "Corrected and sent in again." : "";
  const waiting =
    start.approval === "approved"
      ? start.approverName
        ? `Approved by ${start.approverName} on the owner's say-so.`
        : "Entered by the owner, so it goes ahead."
      : start.stage === "manager"
      ? `Waiting for approval from ${start.approverName}.`
      : "Waiting for the owner's approval.";
  return [opening, waiting].filter(Boolean).join(" ");
}
